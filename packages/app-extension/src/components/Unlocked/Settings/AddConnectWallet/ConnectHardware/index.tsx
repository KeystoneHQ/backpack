import type { Blockchain} from "@coral-xyz/common";
import {
  getAddMessage,
  UI_RPC_METHOD_BLOCKCHAIN_KEYRINGS_ADD,
  UI_RPC_METHOD_KEYSTONE_IMPORT ,
  UI_RPC_METHOD_LEDGER_IMPORT,
} from "@coral-xyz/common";
import { useBackgroundClient } from "@coral-xyz/recoil";

import type { HardwareBlockchainKeyringInit } from "../../../../Onboarding/pages/HardwareOnboard";
import { HardwareOnboard,HardwareType } from "../../../../Onboarding/pages/HardwareOnboard";

import { ConnectHardwareSuccess } from "./ConnectHardwareSuccess";

export function ConnectHardware({
  blockchain,
  createKeyring,
  publicKey,
  onComplete,
}: {
  blockchain: Blockchain;
  createKeyring: boolean;
  publicKey?: string;
  onComplete: () => void;
}) {
  const background = useBackgroundClient();

  const handleHardwareOnboardComplete = async (
    keyringInit: HardwareBlockchainKeyringInit
  ) => {
    if (createKeyring) {
      await background.request({
        method: UI_RPC_METHOD_BLOCKCHAIN_KEYRINGS_ADD,
        params: [
          keyringInit.blockchain,
          keyringInit.derivationPath,
          keyringInit.accountIndex,
          keyringInit.publicKey,
          keyringInit.signature,
          keyringInit.xfp,
          keyringInit.keyringType
        ],
      });
    } else if (keyringInit.keyringType === HardwareType.Keystone) {
      await background.request({
        method: UI_RPC_METHOD_KEYSTONE_IMPORT,
        params: [
          keyringInit.blockchain,
          keyringInit.ur,
          keyringInit.publicKey,
          keyringInit.signature,
        ],
      });
    } else {
      await background.request({
        method: UI_RPC_METHOD_LEDGER_IMPORT,
        params: [
          keyringInit.blockchain,
          keyringInit.derivationPath,
          keyringInit.accountIndex,
          keyringInit.publicKey,
          keyringInit.signature,
        ],
      });
    }
  };

  return (
    <HardwareOnboard
      blockchain={blockchain}
      action={publicKey ? "search" : "import"}
      signMessage={getAddMessage}
      signText="Sign the message to add the wallet to your Backpack account."
      successComponent={<ConnectHardwareSuccess onNext={onComplete} />}
      searchPublicKey={publicKey}
      onComplete={handleHardwareOnboardComplete}
    />
  );
}
