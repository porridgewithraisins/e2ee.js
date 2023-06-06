export type Deps = { crypto: Crypto };
export type Params = {
    counterLength: 64 | 128;
    namedCurve: "P-256" | "P-384" | "P-521";
    keyLength: 128 | 192 | 256;
};
export type Options = { deps: Deps; params: Params };
export type Marshalled = { params: Params; keyPair: CryptoKeyPair | null };
export type KeyGenOptions = {
    extractable?: boolean;
    additionalUsages?: string[];
};
export type UnmarshalOptions = { marshalled: Marshalled; deps?: Deps };

export class E2EE {
    #deps: Deps = { crypto: globalThis.crypto };

    #params: Params = {
        counterLength: 64,
        namedCurve: "P-256",
        keyLength: 256,
    };

    #keyPair: CryptoKeyPair | null = null;

    #sharedSecrets: Record<string | symbol, CryptoKey> = {};

    #unicast = Symbol("unicast");

    constructor(options?: Options) {
        Object.assign(this.#deps, options?.deps);
        Object.assign(this.#params, options?.params);
    }

    async generateKeyPair({ extractable = false, additionalUsages = [] }: KeyGenOptions = {}) {
        if (this.#keyPair) throw new Error("Key pair already exists");

        this.#keyPair = await this.#deps.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: this.#params.namedCurve },
            extractable,
            ["deriveKey", ...additionalUsages] as ReadonlyArray<KeyUsage>
        );
    }

    async exportPublicKey() {
        if (!this.#keyPair) throw new Error("Key pair not generated");

        return this.#marshalKey(this.#keyPair.publicKey);
    }

    async setRemotePublicKey(remotePublicKey: string, identifier: string | symbol = this.#unicast) {
        const unmarshalled = await this.#unmarshalPublicKey(remotePublicKey);
        this.#sharedSecrets[identifier] = await this.#deps.crypto.subtle.deriveKey(
            { name: "ECDH", public: unmarshalled },
            this.#keyPair!.privateKey,
            { name: "AES-CTR", length: this.#params.keyLength },
            false,
            ["encrypt", "decrypt"] as ReadonlyArray<KeyUsage>
        );
    }

    async encrypt(plaintext: string, identifier = this.#unicast) {
        if (!this.#sharedSecrets[identifier]) throw new Error("Shared secret not set");

        const counter = this.#generateIv();
        const buffer = await this.#deps.crypto.subtle.encrypt(
            {
                name: "AES-CTR",
                counter: counter,
                length: this.#params.counterLength,
            },
            this.#sharedSecrets[identifier],
            this.#stringToUint8Array(plaintext)
        );
        return this.#marshalCiphertext({ buffer, counter });
    }

    async decrypt(ciphertext: string, identifier = this.#unicast) {
        if (!this.#sharedSecrets[identifier]) throw new Error("Shared secret not set");

        const { buffer, counter } = this.#unmarshalCiphertext(ciphertext);
        const decryptedBuffer = await this.#deps.crypto.subtle.decrypt(
            {
                name: "AES-CTR",
                counter: counter,
                length: this.#params.counterLength,
            },
            this.#sharedSecrets[identifier],
            buffer
        );
        return this.#uint8ArrayToString(decryptedBuffer);
    }

    marshal() {
        return {
            keyPair: this.#keyPair,
            params: this.#params,
        };
    }

    static unmarshal({ marshalled: { keyPair, params }, deps }) {
        const e2ee = new E2EE({ params, deps });
        e2ee.#restoreKeyPairObject(keyPair);
        return e2ee;
    }

    async exportPrivateKey() {
        if (!this.#keyPair) throw new Error("Key pair not generated");
        if (!this.#keyPair.privateKey.extractable)
            throw new Error("Private key is not extractable");
        return this.#marshalKey(this.#keyPair!.privateKey);
    }

    async importKeyPair({ privateKey, publicKey }: { privateKey: string; publicKey: string }) {
        if (this.#keyPair) throw new Error("Key pair already exists");

        const unmarshalledPrivateKey = await this.#unmarshalPrivateKey(privateKey);
        const unmarshalledPublicKey = await this.#unmarshalPublicKey(publicKey);
        this.#keyPair = { privateKey: unmarshalledPrivateKey, publicKey: unmarshalledPublicKey };
    }

    #restoreKeyPairObject(keyPair: CryptoKeyPair) {
        this.#keyPair = keyPair;
    }

    async #marshalKey(key: CryptoKey) {
        const exported = await this.#deps.crypto.subtle.exportKey("jwk", key);
        const marshalled = JSON.stringify(exported);
        return marshalled;
    }

    async #unmarshalPublicKey(marshalled: string) {
        const unmarshalled = JSON.parse(marshalled);
        const key = await this.#deps.crypto.subtle.importKey(
            "jwk",
            unmarshalled,
            { name: "ECDH", namedCurve: this.#params.namedCurve },
            true,
            []
        );
        return key;
    }

    async #unmarshalPrivateKey(marshalled: string) {
        const unmarshalled = JSON.parse(marshalled);
        const key = await this.#deps.crypto.subtle.importKey(
            "jwk",
            unmarshalled,
            { name: "ECDH", namedCurve: this.#params.namedCurve },
            true,
            unmarshalled.key_ops
        );
        return key;
    }

    #marshalCiphertext({ buffer, counter }: { buffer: ArrayBuffer; counter: ArrayBuffer }) {
        const marshalled = JSON.stringify({
            buffer: String.fromCharCode(...new Uint8Array(buffer)),
            counter: String.fromCharCode(...new Uint8Array(counter)),
        });
        return marshalled;
    }

    #unmarshalCiphertext(marshalled: string) {
        const unmarshalled = JSON.parse(marshalled);
        const buffer = new Uint8Array([...unmarshalled.buffer].map(c => c.charCodeAt(0)));
        const counter = new Uint8Array([...unmarshalled.counter].map(c => c.charCodeAt(0)));

        return { buffer, counter };
    }

    #uint8ArrayToString(buffer: ArrayBuffer) {
        return new TextDecoder().decode(buffer);
    }

    #stringToUint8Array(text: string) {
        return new TextEncoder().encode(text);
    }

    #generateIv() {
        return this.#deps.crypto.getRandomValues(new Uint8Array(16));
    }
}
