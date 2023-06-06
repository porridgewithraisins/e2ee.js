# e2ee.js

An extensively featured, configurable, fast, easy-to-use, zero-dependency, well-tested, WebCrypto based end-to-end encryption library for JS/TS. Works anywhere the WebCrypto API is available - Deno, Node, Cloudflare Workers and every modern browser.

## Cryptographic scheme used

ECDH + AES-CTR

## Features

-   TypeScript support
-   No external dependencies
-   Native WebCrypto API
-   Injectable WebCrypto implementation
-   Supports multi-cast
-   First-class support for persistence and marshalling
-   100% test coverage
-   Configurable security parameters with sane defaults

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

You can also get it from the [esm.sh](https://esm.sh/e2ee.js) and [unpkg](https://unpkg.com/e2ee.js/) CDNs.

```js
import { E2EE } from "https://esm.sh/e2ee.js";
import { E2EE } from "https://unpkg.com/e2ee.js"; //minified esm
import { E2EE } from "https://unpkg.com/e2ee.js/dist/e2ee.esm.js"; // un-minified esm
```

On Deno, pulling the library from [esm.sh](https://esm.sh/e2ee.js) also gives you full TypeScript support.

Also, The un-minified `e2ee.esm.js` and `e2ee.cjs.js` files are available on [unpkg](https://unpkg.com/e2ee.js/), and come with JSdoc comments.

You can also clone the repo and build it yourself.

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

await cat.setRemotePublicKey(await dog.exportPublicKey());
await dog.setRemotePublicKey(await cat.exportPublicKey());

const catSays = "Meow!";
const dogSays = "Woof!";

const encryptedCatSays = await cat.encrypt(catSays);
const encryptedDogSays = await dog.encrypt(dogSays);

const decryptedDogSays = await cat.decrypt(encryptedDogSays);
const decryptedCatSays = await dog.decrypt(encryptedCatSays);

catSays === decryptedCatSays; // true
dogSays === decryptedDogSays; // true
```

This library also supports multicast communication, persistence, and more. Read on for more details.

## Security parameters

-   `counterLength`: The length of the counter used in AES-CTR. The default is 64 bits, which is recommended for AES. The maximum is 128 bits.

-   `namedCurve`: The elliptic curve used in ECDH. The default is `P-256`. The other options are `P-384` and `P-521`.

-   `keyLength`: The length of the key used in ECDH. The default is 256 bits. 128 bit and 192 bit keys are also supported.

Please see the [known issues](#known-issues) for information on various platforms' support for these parameters.

That said,the defaults work perfectly on all platforms. Use them unless you have a good reason not to.

Make sure to use uniform values across all the parties involved in your system. Two parties initialised with different sets of parameters most likely will not be able to communicate with each other.

## Usage

### Flow

1. Generate a key pair with `generateKeyPair()`.
2. Share the public key with the remote party.
3. Set the remote party's public key with `setRemotePublicKey()`
4. On the remote party, set the local party's public key with `setRemotePublicKey()` as well.
5. Encrypt a plaintext with `encrypt()`.
6. Send the ciphertext to the remote party.
7. Decrypt the ciphertext with `decrypt()` on the remote party.

### Multi-party communication

In the call to `setRemotePublicKey()`, you can optionally specify an identifier to distinguish between different remote parties. This allows you to communicate with multiple parties using the same instance of the class.

These identifiers can be used in the `encrypt()` and `decrypt()` calls to specify which remote party can decrypt the ciphertext.

If you don't specify any identifier, the default identifier is used. This reduces API friction between single and multi-party use-cases.

### Persistence

The key pair and the initialisation parameters can be acquired in a persistable format with `marshal()`. Then, they can be used to restore a new instance of the class with the same key pair and parameters using `unmarshal()`.

Remote users' public keys are not persisted, and you must invoke `setRemotePublicKey()` again to restore them.

### Where to persist

The `marshal()` call returns the key pair as a `CryptoKey`, and not as a serialised string.

This is because the private key should not readable at all from JavaScript for security reasons. So, just store the `CryptoKey` facade directly in `IndexedDB`.

However, if you really need to export the private key, e.g if you plan on storing the same identity in multiple devices, see [here](#private-key-export).

### WebCrypto dependency

The class has one optionally injectable dependency: an implementation of `WebCrypto`. If not provided, it defaults to the global `globalThis.crypto` object.

The injected implementation of WebCrypto needs to have the following:

1. A SubtleCrypto implementation, available at `.subtle`
2. `subtle.generateKey()`
3. `subtle.deriveKey()`
4. `subtle.encrypt()`
5. `subtle.decrypt()`
6. `subtle.importKey()`
7. `subtle.exportKey()`
8. `getRandomValues()`

### Deno

On Deno, you must pass in `deriveBits` as an additional usage for the key.
See [here](#known-issues) for more details.

```js
await horse.generateKeyPair({ additionalUsages: ["deriveBits"] });
```

### NodeJS<19

On Node versions that don't have the WebCrypto API available at `globalThis.crypto`, you must provide the implementation in Node's `crypto` library. See [here](#injected-webcrypto) for an example.

### Multi-cast communication

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
// you must give the webcrypto implementation again to unmarshal
const newCow = E2EE.unmarshal({ marshalled: cowMarshalled, deps: { crypto: myImpl } });

await newSheep.setRemotePublicKey(await newCow.exportPublicKey());
await newCow.setRemotePublicKey(await newSheep.exportPublicKey());

const decryptedCowSaysAfterPersistence = await newSheep.decrypt(encryptedCowSays);
const decryptedSheepSaysAfterPersistence = await newCow.decrypt(encryptedSheepSays);

console.assert(sheepSays === decryptedSheepSaysAfterPersistence);
console.assert(cowSays === decryptedCowSaysAfterPersistence);
```

### Injected Webcrypto

```js
// for example, for NodeJS<19, you would do
const deps = { crypto: require('node:crypto').webcrypto };
const bull = new E2EE({ deps });
await bull.generateKeyPair();
// you need to provide them when unmarshalling as well
const bullMarshalled = bull.marshal();
const newBull = E2EE.unmarshal({ marshalled: bullMarshalled, deps });

// with custom initialisation parameters
// you can provide any number of the parameters, and the rest will be filled with the defaults
const horse = new E2EE({ params: { counterLength: 128 } });

const donkey = new E2EE{{ deps: { crypto: require('node:crypto').webcrypto }, params: { namedCurve: "P-384", counterLength: 128}}}

```

### Private key export

```js
await donkey.generateKeyPair({ extractable: true });
const privateKey = await donkey.exportPrivateKey();
const publicKey = await donkey.exportPublicKey();

otherDevice.sendViaQRCode(JSON.stringify({ privateKey, publicKey }));

// in other device
const { privateKey, publicKey } = JSON.parse(receiveViaQRCode());

const alsoDonkey = new E2EE();
await alsoDonkey.importKeyPair({ privateKey, publicKey });

// alsoDonkey is now equivalent to donkey
```

Note that you must use the same security parameters in both instances for this to work. The injected WebCrypto dependency (if any) can be different, however.

### API Reference

```ts
type Deps = {
    crypto: Crypto;
};

type Params = {
    counterLength: 64 | 128;
    namedCurve: "P-256" | "P-384" | "P-521";
    keyLength: 128 | 192 | 256;
};

type Marshalled = { params: Params; keyPair: CryptoKeyPair };

type Options = { deps: Deps =; params?: Params };

const unicast = Symbol()

class E2EE {
    constructor(options: Options = {
        deps: { crypto: globalThis.crypto },
        params: {
            counterLength: 64,
            namedCurve: "P-256",
            keyLength: 256,
        }
    });

    async generateKeyPair({ extractable: boolean = false, additionalUsages: String[] = [] } = {}): Promise<void>

    async exportPublicKey(): Promise<string>

    async setRemotePublicKey(publicKey: string, identifier: string | Symbol = unicast):Promise<void>

    async encrypt(plaintext: string, identifier: string | Symbol = unicast): Promise<string>

    async decrypt(ciphertext: string, identifier: string | Symbol = unicast): Promise<string>

    marshal(): Marshalled

    static unmarshal({ marshalled: Marshalled, deps: Deps }): E2EE

    async exportPrivateKey(): Promise<string>

    async importKeyPair({ privateKey, publicKey }: { privateKey: string; publicKey: string }): Promise<void>
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

and paste the JS it generates into the browser's console.

### Expected behaviour (as of June 2023)

-   All tests pass on Node.js
-   All tests pass on Firefox
-   Tests utilising the P-521 curve fail on Deno. See [here](#known-issues).
-   Tests utilising 192 bit AES keys fail on Chromium-based browsers. See [here](#known-issues). Everything else passes.

## Limitations

-   Only supports string plaintexts for now. So you will have to base64 your binary data before encrypting it. See [here](#developers) for more information.
-   Untested on Safari and Opera. Please open a PR with the results if you test it on these browsers.

## Todo

-   [x] Add Deno support via alternate implementation of `generateKeyPair()`.
-   [x] Make WebCrypto implementation, and other platform provided implementations, injectable as a dependency.
-   [ ] Add support for other plaintext types.
-   [ ] Make marshalling format configurable.
-   [ ] Add helper for managed IndexedDB persistence.

## Known issues

-   [STATUS: Fixed] ~~Does not work on Deno.~~
    -   ~~This is because of Deno incorrectly implementing the `deriveKey()` function. See [this issue](https://github.com/denoland/deno/issues/14693) in the Deno repository.~~
-   [STATUS: Open] The P-521 curve is not yet implemented on Deno. Please see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto#supported_algorithms for updates on their implementation.
-   [Status: WontFix] 192 bit keys are not supported on Chromium based browsers. Please see https://bugs.chromium.org/p/chromium/issues/detail?id=533699 for more information.

## Developers

-   What to do about streaming data?
    -   Looking at https://github.com/wintercg/proposal-webcrypto-streams, it is promising but it also doesn't seem that we will be getting streaming webcrypto in browsers any time soon.
    -   So should this library implement chunking and encrypting binary streams?
    -   In that case, there will be a second binary interface for encryption/decryption aside from the current string based interface.
