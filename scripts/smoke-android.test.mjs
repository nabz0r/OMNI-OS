import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptedHeader,
  restartedVault,
  validateInvocation,
} from "./smoke-android.mjs";

test("reopening may keep ciphertext unchanged; vault identity must still match", () => {
  const vault = {
    header: Buffer.alloc(16, 71),
    size: 4096,
    databaseDigest: "same",
    walDigest: null,
  };
  assert.equal(restartedVault(vault, { ...vault }), true);
  assert.equal(
    restartedVault(vault, { ...vault, header: Buffer.alloc(16, 72) }),
    false,
  );
  assert.equal(
    restartedVault(vault, {
      ...vault,
      header: Buffer.from("SQLite format 3\0"),
    }),
    false,
  );
  assert.equal(encryptedHeader(Buffer.alloc(16), 4096), false);
  assert.equal(encryptedHeader(vault.header, 0), false);
});

test("native acceptance refuses physical devices and non-disposable invocations", () => {
  assert.throws(() =>
    validateInvocation(["--serial", "phone", "--apk", "app.apk"], "true"),
  );
  assert.throws(() =>
    validateInvocation(
      ["--serial", "emulator-5558", "--apk", "app.apk"],
      undefined,
    ),
  );
  assert.throws(() =>
    validateInvocation(
      [
        "--serial",
        "emulator-5558",
        "--apk",
        "app.apk",
        "--serial",
        "emulator-5554",
      ],
      "true",
    ),
  );
  assert.equal(
    validateInvocation(
      ["--serial", "emulator-5558", "--apk", "app.apk"],
      "true",
    ).serial,
    "emulator-5558",
  );
});
