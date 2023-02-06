import type {
  DerivationPath,
  HdKeyringJson,
  ImportedDerivationPath,
  KeyringJson,
  KeystoneKeyringJson,
  LedgerKeyringJson,
  UR,
} from "@coral-xyz/common";

import type { KeystoneKeyringBase } from './keystone';
import type { LedgerKeyringBase } from "./ledger";

export type {
  HdKeyringJson,
  ImportedDerivationPath,
  KeyringJson,
  LedgerKeyringJson,
} from "@coral-xyz/common";

export interface KeyringFactory {
  fromJson(payload: KeyringJson): Keyring;
  fromSecretKeys(secretKeys: Array<string>): Keyring;
}

export interface Keyring {
  publicKeys(): Array<string>;
  deletePublicKey(publicKey: string): void;
  signTransaction(tx: Buffer, address: string): Promise<string>;
  signMessage(tx: Buffer, address: string): Promise<string>;
  exportSecretKey(address: string): string | null;
  importSecretKey(secretKey: string): string;
  toJson(): any;
}

//
// HD keyring types
//
export interface HdKeyringFactory {
  fromMnemonic(
    mnemonic: string,
    derivationPath?: DerivationPath,
    accountIndices?: Array<number>
  ): HdKeyring;
  fromJson(obj: HdKeyringJson): HdKeyring;
}

export interface HdKeyring extends Keyring {
  readonly mnemonic: string;
  readonly derivationPath: string;
  importAccountIndex(accountIndex?: number): [string, number];
  getPublicKey(accountIndex: number): string;
}

//
// Ledger keyring types
//

export interface LedgerKeyringFactory {
  fromAccounts(accounts: Array<ImportedDerivationPath>): LedgerKeyring;
  fromJson(obj: LedgerKeyringJson): LedgerKeyring;
}

export interface LedgerKeyring extends LedgerKeyringBase {
  signTransaction(tx: Buffer, address: string): Promise<string>;
  signMessage(tx: Buffer, address: string): Promise<string>;
  keyCount(): number;
  ledgerImport(path: string, account: number, publicKey: string): Promise<void>;
}

//
// Keystone keyring types
//

export interface KeystoneKeyringFactory {
  fromAccounts(accounts: Array<ImportedDerivationPath>): KeystoneKeyring;
  fromUR(ur: UR): Promise<KeystoneKeyring>;
  fromJson(obj: KeystoneKeyringJson): KeystoneKeyring;
}

export interface KeystoneKeyring extends KeystoneKeyringBase {
  signTransaction(tx: Buffer, address: string): Promise<string>;
  signMessage(tx: Buffer, address: string): Promise<string>;
  keystoneImport(ur: UR, pubKey?: string): Promise<void>;
  toJson(): KeystoneKeyringJson;
  getAccounts(): ImportedDerivationPath[];
  onPlay(fn: (ur: UR) => Promise<void>): void;
  onRead(fn: () => Promise<UR>): void;
}
