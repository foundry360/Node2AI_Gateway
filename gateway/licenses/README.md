# License files (customer host mount)

Installed licenses are stored here (Gateway `ENIGMA_LICENSE_PATH`):

```text
./licenses/enigma.license
        ↓ (Compose mount, writable for Admin install)
/etc/enigma/license/enigma.license
```

**Preferred install path:** Enigma Admin → System → License → **Install License**
(uploads a Foundry360-signed file; validates before replacing any existing license).

Foundry360 may also place the file on the host before start; Admin install is the
supported day-2 and renewal path.

**Never** place vendor private signing keys (`*.private.jwk`) in this directory.

See `docs/enigma/signed-offline-licensing.md`.
