import { arbitrum, avalanche, base, bnb, mainnet, matic, optimism } from "@safeblock/blockchain-utils"
import { Network } from "ethers"

const SafeblockNetworksMap: Record<string, Network> = {
  "NETWORK_BINANCE": bnb,
  "NETWORK_ETHEREUM": mainnet,
  "NETWORK_AVALANCHE": avalanche,
  "NETWORK_ARBITRUM": arbitrum,
  "NETWORK_POLYGON": matic,
  "NETWORK_OPTIMISM": optimism,
  "NETWORK_BASE": base
}

export const networkToSafeblockMap = new Map<string, string>()
export const safeblockToNetworkMap = new Map<string, Network>()

Object.entries(SafeblockNetworksMap).forEach(([name, network]) => {
  networkToSafeblockMap.set(network.name, name)
  safeblockToNetworkMap.set(name, network)
})