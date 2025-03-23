import { Address, networksList } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import ArrayUtils from "~/utils/array-utils"

export interface BasicToken {
  address: Address
  decimals: number
  network: Network
}

type TInconsistentList = Record<string, BasicToken[]> | Map<string, BasicToken[]> | [ string, BasicToken[] ][]

interface Options {
  initialTokens: TInconsistentList
  onTokenAdded: (token: BasicToken) => void
  onTokenRemoved: (token: BasicToken) => void
}


export default class TokensList {
  private readonly tokensList: Map<string, BasicToken[]> = new Map()

  constructor(private readonly options?: Partial<Options>) {
    this.tokensList = TokensList.toConsistent(options?.initialTokens ?? {})
  }

  private static toConsistent(list: TInconsistentList) {
    if (list instanceof Map) return list

    return new Map(!Array.isArray(list) ? Object.entries(list) : list)
  }

  public static from(list: TInconsistentList) {
    return new TokensList({ initialTokens: TokensList.toConsistent(list) })
  }

  public exist(token: BasicToken) {
    const networkTokens = this.tokensList.get(token.network.name)

    if (!networkTokens) return false

    return Address.inArray(token.address, networkTokens.map(token => token.address))
  }

  public get(network: Network, address: Address): BasicToken | null {
    return this.tokensList.get(network.name)?.find(t => t.address.equalTo(address)) ?? null
  }

  public add(token: BasicToken) {
    if (this.exist(token)) return this

    const current = this.tokensList.get(token.network.name) ?? []
    this.tokensList.set(token.network.name, [
      ...current,
      token
    ])

    if (this.options?.onTokenAdded) this.options.onTokenAdded(token)

    return this
  }

  public remove(token: BasicToken) {
    if (!this.exist(token)) return this

    const current = this.tokensList.get(token.network.name) ?? []
    this.tokensList.set(token.network.name, current.filter(a => !a.address.equalTo(token.address)))

    if (this.options?.onTokenRemoved) this.options.onTokenRemoved(token)

    return this
  }

  public listAll() {
    return Array.from(this.tokensList.values()).flat()
  }

  public list(network: Network) {
    return this.tokensList.get(network.name) ?? []
  }

  public get networks() {
    return ArrayUtils.nonNullable(
      Array.from(this.tokensList.keys()).map(networkName => (
        Array.from(networksList).find(n => n.name === networkName)
      ))
    )
  }
}