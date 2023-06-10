Promise.all(
    [
        [64, 128], // counterLength
        ["P-256", "P-384", "P-521"], // namedCurve
        [128, 192, 256], // keyLength
    ]
        .reduce((a, b) => a.flatMap(x => b.map(y => [...x, y])), [[]]) // cartesian product
        .map(async ([counterLength, namedCurve, keyLength]) => {
            const params = { counterLength, namedCurve, keyLength };
            try {
                if (typeof process === "object") {
                    const deps = { crypto: require("node:crypto").webcrypto };
                    await tests(p => new E2EE({ deps, params: p || params }), deps);
                } else if ("Deno" in window) {
                    await tests(
                        p =>
                            // See https://github.com/porridgewithraisins/e2ee#known-issues
                            new Proxy(new E2EE({ params: p || params }), {
                                get: (target, prop) => {
                                    if (prop !== "generateKeyPair")
                                        return target[prop].bind(target);
                                    return options =>
                                        target[prop]({
                                            ...options,
                                            additionalUsages: ["deriveBits"],
                                        });
                                },
                            })
                    );
                } else {
                    await tests(p => new E2EE({ params: p || params }));
                }
            } catch (e) {
                console.error("FAIL: For the param combinations", params);
                console.error(e);
                return "failed";
            }
            return "passed";
        })
).then(results =>
    console.log({
        total: results.length,
        ...results.reduce((a, b) => {
            a[b] = (a[b] || 0) + 1;
            return a;
        }, {}),
    })
);

async function tests(factory, deps = {}) {
    // Test single party communication
    const party1 = factory();
    const party2 = factory();
    await party1.generateKeyPair();
    await party2.generateKeyPair();

    await party1.setRemotePublicKey(await party2.exportPublicKey());
    await party2.setRemotePublicKey(await party1.exportPublicKey());

    const plaintext1 = "Hello world!";
    console.assert((await party1.decrypt(await party2.encrypt(plaintext1))) === plaintext1);

    const plaintext2 = "Secret message!";
    console.assert((await party2.decrypt(await party1.encrypt(plaintext2))) === plaintext2);

    // Test multi-party communication
    const party3 = factory();
    const party4 = factory();
    const party5 = factory();

    await party3.generateKeyPair();
    await party4.generateKeyPair();
    await party5.generateKeyPair();

    const party3PublicKey = await party3.exportPublicKey();
    const party4PublicKey = await party4.exportPublicKey();
    const party5PublicKey = await party5.exportPublicKey();

    await party3.setRemotePublicKey(party4PublicKey, "party4");
    await party3.setRemotePublicKey(party5PublicKey, "party5");
    await party4.setRemotePublicKey(party3PublicKey, "party3");
    await party4.setRemotePublicKey(party5PublicKey, "party5");
    await party5.setRemotePublicKey(party3PublicKey, "party3");
    await party5.setRemotePublicKey(party4PublicKey, "party4");

    // Test that only the intended, identified party can decrypt
    const plaintext3 = "Hello world!";
    const ciphertext3 = await party3.encrypt(plaintext3, "party4");
    const decrypted3 = await party4.decrypt(ciphertext3, "party3");
    console.assert(decrypted3 === plaintext3);
    const decrypted3_fail = await party5.decrypt(ciphertext3, "party3");
    console.assert(decrypted3_fail !== plaintext3);

    // Test that marshalling works
    const party6 = factory();
    const party7 = factory();
    await party6.generateKeyPair();
    await party7.generateKeyPair();

    await party6.setRemotePublicKey(await party7.exportPublicKey(), "party7");
    await party7.setRemotePublicKey(await party6.exportPublicKey(), "party6");

    const plaintext4 = "Secret message!";
    const ciphertext4 = await party6.encrypt(plaintext4, "party7");
    const plaintext5 = "Another secret message!";
    const ciphertext5 = await party7.encrypt(plaintext5, "party6");

    const persistedParty6 = party6.marshal();
    const persistedParty7 = party7.marshal();

    const newParty6 = E2EE.unmarshal({ marshalled: persistedParty6, deps });
    const newParty7 = E2EE.unmarshal({ marshalled: persistedParty7, deps });

    await newParty6.setRemotePublicKey(await newParty7.exportPublicKey(), "party7");
    await newParty7.setRemotePublicKey(await newParty6.exportPublicKey(), "party6");

    const decrypted4 = await newParty7.decrypt(ciphertext4, "party6");
    console.assert(decrypted4 === plaintext4);
    const decrypted5 = await newParty6.decrypt(ciphertext5, "party7");
    console.assert(decrypted5 === plaintext5);

    // Test private key export

    const party8 = factory();
    const party9 = factory();
    await party8.generateKeyPair({ extractable: true });
    await party9.generateKeyPair({ extractable: true });

    await party8.setRemotePublicKey(await party9.exportPublicKey());
    await party9.setRemotePublicKey(await party8.exportPublicKey());

    const plaintext = "Secret!!";
    const ciphertext = await party9.encrypt(plaintext);
    console.assert(plaintext == (await party8.decrypt(ciphertext)));

    const exportedParams = await party8.exportParams();
    const exportedKeyPair = {
        privateKey: await party8.exportPrivateKey(),
        publicKey: await party8.exportPublicKey(),
    };
    // assume the person identified as party8 wants to send their private key to
    // another device, identified as party10, so that they can decrypt messages on both devices.
    const party10 = factory(exportedParams);
    await party10.importKeyPair(exportedKeyPair);

    await party10.setRemotePublicKey(await party9.exportPublicKey());
    await party9.setRemotePublicKey(await party10.exportPublicKey());

    console.assert(plaintext == (await party10.decrypt(ciphertext)));

    // test encrypt and decrypt streams
    const src = factory();
    await src.generateKeyPair();
    const dest = factory();
    await dest.generateKeyPair();

    await dest.setRemotePublicKey(await src.exportPublicKey());
    await src.setRemotePublicKey(await dest.exportPublicKey());

    const url =
        "https://raw.githubusercontent.com/TheProfs/socket-mem-leak/master/10mb-sample.json";

    const data = await fetch(url).then(res => res.text());

    const cycledData = await fetch(url)
        .then(res => {
            if (!res.ok) throw new Error("response not ok");
            if (!res.body) throw new Error("response has no body");
            return new Response(
                res.body.pipeThrough(src.encryptStream()).pipeThrough(dest.decryptStream())
            );
        })
        .then(res => res.text());

    console.assert(data === cycledData);

    // Test that precondition errors are thrown
    const party11 = factory();
    await party11.exportPublicKey().catch(e => console.assert(e));
    await party11.setRemotePublicKey("anything").catch(e => console.assert(e));
    await party11.encrypt("anything").catch(e => console.assert(e));
    try {
        party11.encryptStream("anything");
    } catch (e) {
        console.assert(e);
    }
    await party11.decrypt("anything").catch(e => console.assert(e));
    try {
        party11.decryptStream("anything");
    } catch (e) {
        console.assert(e);
    }

    const party12 = factory();
    await party12.generateKeyPair();
    await party12.encrypt("anything").catch(e => console.assert(e));
    try {
        party12.encryptStream("anything");
    } catch (e) {
        console.assert(e);
    }
    await party12.decrypt("anything").catch(e => console.assert(e));
    try {
        party12.decryptStream("anything");
    } catch (e) {
        console.assert(e);
    }

    const party13 = factory();
    await party13.generateKeyPair();
    await party13.generateKeyPair().catch(e => console.assert(e));

    const party14 = factory();
    await party14.exportPrivateKey().catch(e => console.assert(e));
    await party14.generateKeyPair();
    await party14.exportPrivateKey().catch(e => console.assert(e));

    const party15 = factory();
    await party15.generateKeyPair({ extractable: true });
    const exported = {
        privateKey: await party15.exportPrivateKey(),
        publicKey: await party15.exportPublicKey(),
    };

    const party16 = factory();
    await party16.generateKeyPair();
    await party16.importKeyPair(exported).catch(e => console.assert(e));
}
