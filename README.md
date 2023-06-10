# e2ee.js

A lightweight, yet extensively featured, secure, configurable, fast, easy-to-use, zero-dependency, well-tested, WebCrypto based end-to-end encryption library for JS/TS. Works anywhere - Deno, Node, Cloudflare Workers and every modern browser.

## Cryptographic scheme used

ECDH + AES-CTR.

## Features

-   TypeScript support
-   Tiny (<1kb, minified and gzipped)
-   No external dependencies
-   Web-native WebCrypto API
-   Supports multi-cast communication
-   Supports streaming binary data (files, media, arbitrary `fetch()` responses, etc,.) using the Web-native Streams API
-   Injectable implementations of WebCrypto and Streams for easy polyfilling
-   First-class support for persistence and marshalling of all sorts
-   100% test coverage
-   Configurable security parameters with sane defaults
-   Mitigates supply chain attacks with NPM/Github Actions provenance (See the bottom of the [npm listing](https://www.npmjs.com/package/e2ee.js) for the transparency log entry and other details)

## Install

The package is hosted at [npm](https://www.npmjs.com/package/e2ee.js).

```bash
npm i e2ee.js
```

```js
const { E2EE } = require("e2ee.js");
//esm
import { E2EE } from "e2ee.js";
```

You can also get it from the [esm.sh](https://esm.sh/e2ee.js) and [unpkg](https://unpkg.com/e2ee.js/) CDNs. (Any other CDN with npm as their source works. e.g skypack)

```js
import { E2EE } from "https://esm.sh/e2ee.js";
import { E2EE } from "https://unpkg.com/e2ee.js"; //minified esm
import { E2EE } from "https://unpkg.com/e2ee.js/dist/e2ee.esm.js"; // un-minified esm
```

On Deno, pulling the library from [esm.sh](https://esm.sh/e2ee.js) also gives you full TypeScript support.

Also, The un-minified `e2ee.esm.js` and `e2ee.cjs.js` files are available on [unpkg](https://unpkg.com/e2ee.js/), and come with JSdoc comments.

You can also build it yourself.

First, clone the repo.

```bash
git clone https://github.com/porridgewithraisins/e2ee.js
cd e2ee.js
```

Then, see [here](#building) for build instructions.

## Quickstart

```js
const cat = new E2EE();
const dog = new E2EE();

await cat.generateKeyPair();
await dog.generateKeyPair();

const catPublicKey = await cat.exportPublicKey();
const dogPublicKey = await dog.exportPublicKey();

// now share the public keys across, e.g over a network
// as part of diffie-hellman
await cat.setRemotePublicKey(dogPublicKey);
await dog.setRemotePublicKey(catPublicKey);

// ecdh is now complete, and the two parties have arrived at a shared secret
// and can now communicate securely using aes-ctr encryption

const catSays = "Meow!";
const dogSays = "Woof!";

const encryptedCatSays = await cat.encrypt(catSays);
const encryptedDogSays = await dog.encrypt(dogSays);

const decryptedDogSays = await cat.decrypt(encryptedDogSays);
const decryptedCatSays = await dog.decrypt(encryptedCatSays);

catSays === decryptedCatSays; // true
dogSays === decryptedDogSays; // true
```

This library also supports streaming data, multicast communication, persistence, and more. Read on for the details.

## Security parameters

-   `counterLength`: The length of the counter used in AES-CTR. The default is 64 bits, which is recommended for AES. The maximum is 128 bits.

-   `namedCurve`: The elliptic curve used in ECDH. The default is `P-256`. The other options are `P-384` and `P-521`.

-   `keyLength`: The length of the key used in ECDH. The default is 256 bits. 128 bit and 192 bit keys are also supported.

Please see the [known issues](#known-issues) for information on various platforms' support for various values of these parameters.

That said, the defaults work perfectly on all platforms. So use them unless you have a good reason not to.

Make sure to use uniform values across all the parties involved in your system. Two parties initialised with different sets of parameters most likely will not be able to communicate with each other.

## Usage

### Flow

1. Generate a key pair with `generateKeyPair()`.
2. Share the public key retrieved with `exportPublicKey()` with the remote party.
3. Set the remote party's public key with `setRemotePublicKey()`.
4. Also set the local party's public key on the remote party.
5. Encrypt a plaintext with `encrypt()`.
6. Send the ciphertext to the remote party.
7. Decrypt the ciphertext with `decrypt()` on the remote party.

### Streaming

The `encryptStream()` method returns a [`TransformStream`](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream) which you can use to encrypt a binary stream. Similarly, `decryptStream()` returns a `TransformStream` which can be used to decrypt a binary stream. See [here](#performance) for caveats.

### Multi-cast communication

In the call to `setRemotePublicKey()`, you can optionally specify an identifier to distinguish between different remote parties. This allows you to communicate with multiple parties using the same instance of the class.

These identifiers can be used in the `encrypt()`, `encryptStream()`, `decrypt()` and `decryptStream()` calls to specify which remote party can decrypt the ciphertext.

If you don't specify any identifier, the default identifier is used.

### Persistence

The key pair and the initialisation parameters can be acquired in a persistable format with `marshal()`. Then, they can be used to restore a new instance of the class with the same key pair and parameters using `unmarshal()`.

Remote users' public keys are not persisted, and you must invoke `setRemotePublicKey()` again to restore them.

### Where to persist

The `marshal()` call returns the key pair as a `CryptoKey`, and not as a serialised string.

This is because the private key should not readable at all from JavaScript for security reasons. So, just store the `CryptoKey` facade directly in `IndexedDB`.

However, if you really need to export the private key, e.g if you plan on storing the same identity in multiple devices, see [here](#private-key-export).

### Dependencies

The class has optionally injectable dependencies in the `deps` option in the constructor:

1. An implementation of the [`WebCrypto`](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) object. If it is not provided, an implementation needs to be available at `globalThis.crypto`.
2. An implementation of the [`TransformStream`](https://developer.mozilla.org/en-US/docs/Web/API/TransformStream) class. If it is not provided, an implementation needs to be available at `globalThis.TransformStream`.

The provided implementation of WebCrypto needs to have the following:

1. `getRandomValues()`
2. A SubtleCrypto implementation, available at `.subtle`
3. `subtle.generateKey()`
4. `subtle.deriveKey()`
5. `subtle.encrypt()`
6. `subtle.decrypt()`
7. `subtle.importKey()`
8. `subtle.exportKey()`

### Deno

On Deno, you must pass in `deriveBits` as an additional usage for the key.
See [here](#known-issues) for more details.

```js
const horse = new E2EE();
await horse.generateKeyPair({ additionalUsages: ["deriveBits"] });
```

### NodeJS

On Node versions that don't have the `WebCrypto` API available at `globalThis.crypto` or the `TransformStream` API available at `globalThis.TransformStream` you must provide the implementation yourself. See [here](#custom-dependencies) for an example.

## Examples

### Key exchange over websockets

```js
// machine A
const tiger = new E2EE();
io.emit("publicKey", await tiger.exportPublicKey());
io.on("publicKey", async publicKey => {
    await tiger.setRemotePublicKey(publicKey);
});

// machine B
const lion = new E2EE();
io.emit("publicKey", await lion.exportPublicKey());
io.on("publicKey", async publicKey => {
    await lion.setRemotePublicKey(publicKey);
});
```

In further examples, everything runs in the same machine for the sake of brevity.

### Streaming

```js
const monkey = new E2EE();
const giraffe = new E2EE();
await monkey.generateKeyPair();
await giraffe.generateKeyPair();

await monkey.setRemotePublicKey(await giraffe.exportPublicKey());
await giraffe.setRemotePublicKey(await monkey.exportPublicKey());

// now monkey will encrypt a file and stream it to a server
const favoriteFood = new File(["banana"], "banana.txt", { type: "text/plain" });

await fetch("/upload", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: favoriteFood.stream().pipeThrough(monkey.encryptStream()),
});

// now giraffe will stream the file and decrypt it
const response = await fetch("/download");
const decryptedStream = await response.body.pipeThrough(giraffe.decryptStream());
const decryptedBlob = await new Response(decryptedStream).blob();
const decryptedFile = new File([decryptedBlob], "banana.txt", { type: "text/plain" });
```

### Multi-cast communication example

```js
const goat = new E2EE();
const cat = new E2EE();
const dog = new E2EE();

await goat.generateKeyPair();
await cat.generateKeyPair();
await dog.generateKeyPair();

await goat.setRemotePublicKey(await cat.exportPublicKey(), "cat");
await goat.setRemotePublicKey(await dog.exportPublicKey(), "dog");
await cat.setRemotePublicKey(await goat.exportPublicKey(), "goat");
await cat.setRemotePublicKey(await dog.exportPublicKey(), "dog");
await dog.setRemotePublicKey(await goat.exportPublicKey(), "goat");
await dog.setRemotePublicKey(await cat.exportPublicKey(), "cat");

const goatSays = "ankara messi";

const encryptedGoatSaysOnlyToTheCat = await goat.encrypt(goatSays, "cat");
const decryptedGoatSaysOnlyToTheCat = await cat.decrypt(encryptedGoatSaysOnlyToTheCat, "goat");

// only the intended recipient can decrypt the message
console.assert(goatSays === decryptedGoatSaysOnlyToTheCat);
// others cannot
const decryptedGoatSaysByTheDog = await dog.decrypt(encryptedGoatSaysOnlyToTheCat, "goat");
console.assert(goatSays !== decryptedGoatSaysByTheDog);
```

### Persistence

```js
const sheepMarshalled = sheep.marshal();
const cowMarshalled = cow.marshal();

const newSheep = E2EE.unmarshal({ marshalled: sheepMarshalled });
// If you're using custom implementations of WebCrypto or TransformStream, you need to provide them here as well
// if you don't, it defaults to globalThis.crypto and globalThis.TransformStream
const newCow = E2EE.unmarshal({ marshalled: cowMarshalled, deps: { crypto: myImpl } });

await newSheep.setRemotePublicKey(await newCow.exportPublicKey());
await newCow.setRemotePublicKey(await newSheep.exportPublicKey());

const decryptedCowSaysAfterPersistence = await newSheep.decrypt(encryptedCowSays);
const decryptedSheepSaysAfterPersistence = await newCow.decrypt(encryptedSheepSays);

console.assert(sheepSays === decryptedSheepSaysAfterPersistence);
console.assert(cowSays === decryptedCowSaysAfterPersistence);
```

### Custom Dependencies

```js
const deps = {
    crypto: require("node:crypto").webcrypto,
    TransformStream: require("node:stream/web").TransformStream,
};
const bull = new E2EE({ deps });
await bull.generateKeyPair();
// you need to provide them when unmarshalling as well
const bullMarshalled = bull.marshal();
const newBull = E2EE.unmarshal({ marshalled: bullMarshalled, deps });
```

### Custom initialisation parameters

```js
// you can provide any number of the parameters, and the rest will be filled with the defaults
const bear = new E2EE({ params: { counterLength: 128 } });

const donkey = new E2EE({
    deps: { crypto: require("node:crypto").webcrypto },
    params: { namedCurve: "P-384", counterLength: 128 },
});
```

### Private key export

```js
const pig = new E2EE();
await pig.generateKeyPair({ extractable: true });
const privateKey = await pig.exportPrivateKey();
const publicKey = await pig.exportPublicKey();
const parameters = pig.exportParams();

sendViaQRCode(JSON.stringify({ params, privateKey, publicKey }));

// in other device
const { params, privateKey, publicKey } = JSON.parse(receiveViaQRCode());
const alsoPig = new E2EE({ params });
await alsoPig.importKeyPair({ privateKey, publicKey });
// alsoPig is now equivalent to pig
```

## Performance

When streaming data, the stream methods may not work/be slow for the following reasons:

### You're streaming it from/to a [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/fetch) request, while using HTTP/1.x.

HTTP/1.x doesn't support streaming data. (Well, it does, through chunked transfer encoding, but browsers don't implement it for requests).

### The data source is large, _and_ the stream is ready to serve _all_ of it, causing the `encryptStream()` Transform to receive all of the data at once.

In preliminary testing, this seems to be a problem only in browsers, and not in Node/Deno.

The problem arises because browsers don't limit the size of the chunks they send from a `fetch()`, opting to send all the data that is available, leading to the encrypting transform receiving many megabytes of data in a single chunk! Now, the AES algorithm has a block size of 16 bytes, which means that it can only encrypt 16 bytes at once.
If you pass 10MB of data, the WebCrypto API of course, efficiently uses the CPU by encrypting multiple blocks in parallel. However, since a single chunk is 10MB, it would process all 6,55,360 blocks before returning the entire encrypted chunk. This defeats the purpose of streaming.

Node was observed to be chunking the data into 32KB chunks, and Deno was observed to be chunking the data into 8KB chunks, both of which are acceptable.

To combat this problem, you may use the following utility.

```ts
function chunkSizeLimiter(chunkSizeLimit: number) {
    return new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            while (chunk.length > 0) {
                const toSend = chunk.subarray(0, chunkSizeLimit);
                chunk = chunk.subarray(chunkSizeLimit);
                controller.enqueue(toSend);
            }
        },
    });
}
```

and then fit it into the stream like so:

```js
response.body
    .pipeThrough(chunkSizeLimiter(0x2000)) // 8KB
    .pipeThrough(koala.encryptStream());
```

Note:

-   Only apply this optimisation if you're actually facing performance issues.
-   The chunk size limit must be a multiple of 16, or else the encryption/decryption will fail.
-   The chunk size limit must not be too low, lest the stream crawl to a halt. 8KB/16KB is always a good value, considering it is the default on Deno/Node.js

## API Reference

```ts
type Deps = {
    crypto: Crypto;
};

type Params = {
    counterLength: 64 | 128;
    namedCurve: "P-256" | "P-384" | "P-521";
    keyLength: 128 | 192 | 256;
};

type Options = { deps: Deps =; params?: Params };

type KeyGenOptions = {
    extractable?: boolean;
    additionalUsages?: KeyUsage[]; //type KeyUsage is from the WebCrypto type definitions
};

type Marshalled = { params: Params; keyPair: CryptoKeyPair };

type UnmarshalOptions = { marshalled: Marshalled; deps?: Deps };

const unicast = Symbol();

class E2EE {
    constructor(options: Options = {
        deps: { crypto: globalThis.crypto },
        params: {
            counterLength: 64,
            namedCurve: "P-256",
            keyLength: 256,
        }
    });

    async generateKeyPair({ extractable: boolean = false, additionalUsages: String[] = [] }: KeyGenOptions = {}): Promise<void>;

    async exportPublicKey(): Promise<string>;

    async setRemotePublicKey(publicKey: string, identifier: string | symbol = unicast):Promise<void>;

    async encrypt(plaintext: string, identifier: string | symbol = unicast): Promise<string>;

    async decrypt(ciphertext: string, identifier: string | symbol = unicast): Promise<string>;

    encryptStream(identifier: string | symbol = unicast): TransformStream<Uint8Array, string>;

    decryptStream(identifier: string | symbol = unicast): TransformStream<string, Uint8Array>;

    marshal(): Marshalled;

    static unmarshal(options: UnmarshalOptions): E2EE;

    async exportPrivateKey(): Promise<string>;

    exportParams(): Params;

    async importKeyPair({ privateKey, publicKey }: { privateKey: string; publicKey: string }): Promise<void>;
}
```

## Building

```bash
#all builds
npm run build
#only node
npm run build:cjs
#only deno
npm run build:esm
#only browser (minified)
npm run build:browser
#only types
npm run build:types
```

The built files will be placed in the `dist` folder.

## Testing

```bash
# all tests
npm test
# only node
npm run test:node
# only deno
npm run test:deno
```

To test in any browser, run

```bash
npm run --silent test:browser:gen
```

and paste the JS it generates into the browser's console. Wait for the promise to resolve, and you should see the test results.

### Expected behaviour (as of June 2023)

-   All tests pass on Node.js.
-   All tests pass on Firefox.
-   Tests utilising the P-521 curve fail on Deno. See [here](#known-issues). Everything else passes.
-   Tests utilising 192 bit AES keys fail on Chromium-based browsers. See [here](#known-issues). Everything else passes.

## Limitations

-   Untested on Safari and Opera. Please open a PR with the results if you test it on these browsers.

## Todo

-   [x] Add Deno support via alternate implementation of `generateKeyPair()`.
-   [x] Make WebCrypto implementation, and other platform provided implementations, injectable as a dependency.
-   [x] Add support for streaming.
-   [ ] Add helper for managed IndexedDB persistence.

## Known issues

-   [STATUS: Workaround added] ~~Does not work on Deno.~~
    -   ~~This is because of Deno incorrectly implementing the `deriveKey()` function.~~ See [this issue](https://github.com/denoland/deno/issues/14693) in the Deno repository.
-   [STATUS: Open] The P-521 curve is not yet implemented on Deno. Please see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto#supported_algorithms for updates on their implementation.
-   [Status: WontFix] 192 bit keys are not supported on Chromium-based browsers. Please see https://bugs.chromium.org/p/chromium/issues/detail?id=533699 for more information.
