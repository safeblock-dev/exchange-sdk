import { ethersProvider } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import { LayerZero__factory } from "~/abis/types"
import { contractAddresses } from "~/config"
import { SdkConfig } from "~/sdk"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"

export default async function messageQuoter(network: Network, sdkConfig: SdkConfig, lzId: number, data: string) {
  const provider = ethersProvider(network)

  if (!provider) return new SdkException(`Provider not found for network ${ network.name }`, SdkExceptionCode.InternalError)

  const lzContract = LayerZero__factory.connect(contractAddresses.entryPoint(network, sdkConfig), provider)

  const message = await lzContract.quoteMessage(lzId, data)
    .catch(() => null)

  if (!message) return new SdkException("Cannot get message through message quoter", SdkExceptionCode.InternalError)

  return message.toString()
}