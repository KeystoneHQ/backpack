import {
  HdKeyring,
  HdKeyringFactory,
  HdKeyringJson,
  ImportedDerivationPath,
  Keyring,
  KeyringFactory,
  KeyringJson,
  KeystoneKeyring,
  KeystoneKeyringBase,
  KeystoneKeyringFactory,
  LedgerKeyring,
  LedgerKeyringJson,
} from "@coral-xyz/blockchain-keyring";
import { LedgerKeyringBase } from "@coral-xyz/blockchain-keyring";
import {
  DerivationPath,
  KeystoneKeyringJson,
  LEDGER_METHOD_SOLANA_SIGN_MESSAGE,
  LEDGER_METHOD_SOLANA_SIGN_TRANSACTION,
  UR,
} from "@coral-xyz/common";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { mnemonicToSeedSync, validateMnemonic } from "bip39";
import * as bs58 from "bs58";
import nacl from "tweetnacl";

import { deriveSolanaKeypair, deriveSolanaKeypairs } from "../util";
import { KeystoneKeyring as KeystoneKeyringOrigin } from './keystone';

export class SolanaKeyringFactory implements KeyringFactory {
  /**
   *
   */
  public fromJson(payload: KeyringJson): SolanaKeyring {
    const keypairs = payload.secretKeys.map((secret: string) =>
      Keypair.fromSecretKey(Buffer.from(secret, "hex"))
    );
    return new SolanaKeyring(keypairs);
  }

  public fromSecretKeys(secretKeys: Array<string>): SolanaKeyring {
    const keypairs = secretKeys.map((secret: string) =>
      Keypair.fromSecretKey(Buffer.from(secret, "hex"))
    );
    return new SolanaKeyring(keypairs);
  }
}

class SolanaKeyring implements Keyring {
  constructor(public keypairs: Array<Keypair>) {}

  public publicKeys(): Array<string> {
    return this.keypairs.map((kp) => kp.publicKey.toString());
  }

  public deletePublicKey(publicKey: string) {
    this.keypairs = this.keypairs.filter(
      (kp) => kp.publicKey.toString() !== publicKey
    );
  }

  // `address` is the key on the keyring to use for signing.
  public async signTransaction(tx: Buffer, address: string): Promise<string> {
    const pubkey = new PublicKey(address);
    const kp = this.keypairs.find((kp) => kp.publicKey.equals(pubkey));
    if (!kp) {
      throw new Error(`unable to find ${address.toString()}`);
    }
    return bs58.encode(nacl.sign.detached(new Uint8Array(tx), kp.secretKey));
  }

  public async signMessage(tx: Buffer, address: string): Promise<string> {
    // TODO: this shouldn't blindly sign. We should check some
    //       type of unique prefix that asserts this isn't a
    //       real transaction.
    return this.signTransaction(tx, address);
  }

  public exportSecretKey(address: string): string | null {
    const pubkey = new PublicKey(address);
    const kp = this.keypairs.find((kp) => kp.publicKey.equals(pubkey));
    if (!kp) {
      return null;
    }
    return bs58.encode(kp.secretKey);
  }

  public importSecretKey(secretKey: string): string {
    const kp = Keypair.fromSecretKey(Buffer.from(secretKey, "hex"));
    this.keypairs.push(kp);
    return kp.publicKey.toString();
  }

  public toJson(): any {
    return {
      secretKeys: this.keypairs.map((kp) =>
        Buffer.from(kp.secretKey).toString("hex")
      ),
    };
  }
}

export class SolanaHdKeyringFactory implements HdKeyringFactory {
  public fromMnemonic(
    mnemonic: string,
    derivationPath?: DerivationPath,
    accountIndices: Array<number> = [0]
  ): HdKeyring {
    if (!derivationPath) {
      derivationPath = DerivationPath.Default;
    }
    if (!validateMnemonic(mnemonic)) {
      throw new Error("Invalid seed words");
    }
    const seed = mnemonicToSeedSync(mnemonic);
    const keypairs = deriveSolanaKeypairs(seed, derivationPath, accountIndices);
    return new SolanaHdKeyring({
      mnemonic,
      seed,
      accountIndices,
      keypairs,
      derivationPath,
    });
  }

  public fromJson(obj: HdKeyringJson): HdKeyring {
    const { mnemonic, seed: seedStr, accountIndices, derivationPath } = obj;
    const seed = Buffer.from(seedStr, "hex");
    const keypairs = deriveSolanaKeypairs(seed, derivationPath, accountIndices);
    return new SolanaHdKeyring({
      mnemonic,
      seed,
      derivationPath,
      keypairs,
      accountIndices,
    });
  }
}

class SolanaHdKeyring extends SolanaKeyring implements HdKeyring {
  readonly mnemonic: string;
  readonly derivationPath: DerivationPath;
  private seed: Buffer;
  // Invariant: the order of these indices *must* match the order of these
  //            super classes' keypairs.
  private accountIndices: Array<number>;

  constructor({
    mnemonic,
    seed,
    accountIndices,
    keypairs,
    derivationPath,
  }: {
    mnemonic: string;
    seed: Buffer;
    keypairs: Array<Keypair>;
    derivationPath: DerivationPath;
    accountIndices: Array<number>;
  }) {
    super(keypairs);
    this.mnemonic = mnemonic;
    this.seed = seed;
    this.derivationPath = derivationPath;
    this.accountIndices = accountIndices;
  }

  public deletePublicKey(publicKey: string) {
    const idx = this.keypairs.findIndex(
      (kp) => kp.publicKey.toString() === publicKey
    );
    if (idx < 0) {
      return;
    }
    this.accountIndices = this.accountIndices
      .slice(0, idx)
      .concat(this.accountIndices.slice(idx + 1));
    super.deletePublicKey(publicKey);
  }

  /**
   * Import a new wallet using an account index. if the account index is not
   * given the next available account index is used.
   */
  public importAccountIndex(accountIndex?: number): [string, number] {
    if (accountIndex === undefined) {
      accountIndex = Math.max(...this.accountIndices) + 1;
    }
    const kp = deriveSolanaKeypair(
      this.seed.toString("hex"),
      accountIndex,
      this.derivationPath
    );
    this.keypairs.push(kp);
    this.accountIndices.push(accountIndex);
    return [kp.publicKey.toString(), accountIndex];
  }

  public getPublicKey(accountIndex: number): string {
    // This might not be true once we implement account deletion.
    // One solution is to simply make that a UI detail.
    if (this.keypairs.length !== this.accountIndices.length) {
      throw new Error("invariant violation");
    }
    const kp = this.keypairs[this.accountIndices.indexOf(accountIndex)];
    return kp.publicKey.toString();
  }

  public toJson(): HdKeyringJson {
    return {
      mnemonic: this.mnemonic,
      seed: this.seed.toString("hex"),
      accountIndices: this.accountIndices,
      derivationPath: this.derivationPath,
    };
  }
}

export class SolanaLedgerKeyringFactory {
  public fromAccounts(accounts: Array<ImportedDerivationPath>): LedgerKeyring {
    return new SolanaLedgerKeyring(accounts);
  }

  public fromJson(obj: LedgerKeyringJson): LedgerKeyring {
    return new SolanaLedgerKeyring(obj.derivationPaths);
  }
}

export class SolanaLedgerKeyring
  extends LedgerKeyringBase
  implements LedgerKeyring
{
  public async signTransaction(tx: Buffer, address: string): Promise<string> {
    const path = this.derivationPaths.find((p) => p.publicKey === address);
    if (!path) {
      throw new Error("ledger address not found");
    }
    return await this.request({
      method: LEDGER_METHOD_SOLANA_SIGN_TRANSACTION,
      params: [bs58.encode(tx), path.path, path.account],
    });
  }

  public async signMessage(msg: Buffer, address: string): Promise<string> {
    const path = this.derivationPaths.find((p) => p.publicKey === address);
    if (!path) {
      throw new Error("ledger address not found");
    }
    return await this.request({
      method: LEDGER_METHOD_SOLANA_SIGN_MESSAGE,
      params: [bs58.encode(msg), path.path, path.account],
    });
  }

  public static fromString(str: string): SolanaLedgerKeyring {
    const { derivationPaths } = JSON.parse(str);
    return new SolanaLedgerKeyring(derivationPaths);
  }
}

export class SolanaKeystoneKeyringFactory implements KeystoneKeyringFactory {
  public fromAccounts(accounts: Array<ImportedDerivationPath>): KeystoneKeyring {
    return new SolanaKeystoneKeyring();
  }

  public async fromUR(ur: UR): Promise<KeystoneKeyring> {
    return await SolanaKeystoneKeyring.fromUR(ur);
  }

  public fromJson(obj: KeystoneKeyringJson): KeystoneKeyring {
    return new SolanaKeystoneKeyring();
  }
}

export class SolanaKeystoneKeyring extends KeystoneKeyringBase implements KeystoneKeyring {
  private keyring: KeystoneKeyringOrigin;

  constructor() {
    super()
    this.keyring = new KeystoneKeyringOrigin();
  }

  public onPlay(fn: (ur: UR) => Promise<void>) {
    this.keyring.getInteraction().onPlay(fn);
  }

  public onRead(fn: () => Promise<UR>) {
    this.keyring.getInteraction().onRead(fn);
  }

  public async signTransaction(tx: Buffer, address: string): Promise<string> {
    const signedTx = await this.keyring.signTransaction(address, Transaction.from(tx));
    return signedTx.signature ? Buffer.from(signedTx.signature).toString('hex') : '';
  }

  public async signMessage(msg: Buffer, address: string): Promise<string> {
    return Buffer.from(await this.keyring.signMessage(address, msg)).toString('hex');
  }

  public async keystoneImport(ur: UR) {
    this.keyring.getInteraction().onRead(() => ur);
    await this.keyring.readKeyring();
  }

  public static async fromUR(ur: UR) {
    const inst = new SolanaKeystoneKeyring();
    await inst.keystoneImport(ur);
    return inst;
  }

  public publicKeys() {
    return this.keyring.getAccounts().map(e => e.pubKey);
  }

  public getAccounts(): ImportedDerivationPath[] {
    return this.keyring.getAccounts().map(e => ({
      path: e.hdPath,
      account: e.index,
      publicKey: e.pubKey,
    }));
  }

  public toJson() {
    return {
      accounts: this.getAccounts(),
    };
  }
}
