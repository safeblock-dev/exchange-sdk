import { arbitrum, avalanche, base, bnb, gnosis, mainnet, matic, optimism, scroll } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import { SdkConfig } from "~/sdk"

const SafeblockNetworksMap: Record<string, Network> = {
  "binance": bnb,
  "ethereum": mainnet,
  "avalanche": avalanche,
  "arbitrum": arbitrum,
  "polygon": matic,
  "optimism": optimism,
  "base": base,
  "gnosis": gnosis,
  "scroll": scroll
}

/** Function for converting internal `SafeBlock` network names to `ethers`-compatible names */
export function safeblockToNetworkMap(config: SdkConfig): Map<string, Network> {
  return new Map(Object.entries(config.customNetworkMappings ?? SafeblockNetworksMap))
}

/** Function to convert `ethers`-compatible names to internal names of `SafeBlock` networks */
export function networkToSafeblockMap(config: SdkConfig): Map<string, string> {
  const _map = config.customNetworkMappings ?? SafeblockNetworksMap

  return new Map(Object.entries(_map).map(([key, value]) => [value.name, key]))
}

