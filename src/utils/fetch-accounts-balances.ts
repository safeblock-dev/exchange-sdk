import { Address, Amount, multicall, networksList } from "@safeblock/blockchain-utils"
import { MultiCall__factory, Token__factory } from "~/abis/types"
import { MultiCallRequest } from "~/types"
import { BasicToken } from "~/types"

export interface IBalanceData {
  network: string
  balance: Amount
  address: Address
}

export async function fetchAccountBalances(of: Address, tokens: BasicToken[]): Promise<IBalanceData[]> {
  if (!Address.isEthereum(of)) return []

  const evmNetworks = new Map<string, BasicToken[]>()

  for (const token of tokens) {
    if (!evmNetworks.has(token.network.name)) evmNetworks.set(token.network.name, [])
    evmNetworks.get(token.network.name)!.push(token)
  }

  return (
    await Promise.all(
      Array.from(evmNetworks.entries()).map(async ([networkName, tokensList]) => {
        const network = Array.from(networksList).find(n => n.name === networkName)
        if (!network) return []

        const tokenCalls: MultiCallRequest[] = tokensList
          .filter((token) => !Address.isZero(token.address))
          .map((token) => ({
            target: token.address,
            contractInterface: Token__factory,
            calls: [
              {
                method: "balanceOf",
                reference: token.address.toString(),
                methodParameters: [of.toString()]
              }
            ]
          }))

        const ethBalanceCall: MultiCallRequest = {
          target: Address.from("0xcA11bde05977b3631167028862bE2a173976CA11"),
          contractInterface: MultiCall__factory,
          calls: [
            {
              method: "getEthBalance",
              reference: Address.zeroAddress,
              methodParameters: [of.toString()]
            }
          ]
        }

        const requests = [...tokenCalls, ethBalanceCall]

        try {
          const responses = await multicall<[bigint]>(network, requests)

          return responses
            .map((response) => {
              if (!response.data) return null

              const token = tokensList.find((t) =>
                Address.equal(t.address, response.reference ?? "")
              )

              if (!token || !response.data[0]) return null

              return {
                network: network.name,
                address: token.address,
                balance: Amount.from(response.data[0], token.decimals, false)
              }
            })
            .filter((item): item is IBalanceData => item !== null)
        }
        catch {
          return []
        }
      })
    )
  ).flat()
}
