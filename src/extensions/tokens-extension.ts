import { Address, Amount, arrayUtils, evmNetworksList } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import { publicBackendURL } from "~/config"
import SafeBlock, { SdkConfig } from "~/sdk"
import { TokensListExtension } from "~/extensions"
import SdkExtension from "~/sdk/sdk-extension"
import { fetchAccountBalances, IBalanceData } from "~/utils/fetch-accounts-balances"
import request from "~/utils/request"
import { networkToSafeblockMap, safeblockToNetworkMap } from "~/utils/safeblock-mappings"
import { BasicToken } from "~/types"

interface BackendToken {
  address: string
  decimals: number
  id: string
  name: string
  network: string
  symbol: string
  image_path?: string
}

interface FetchTokensOptions {
  searchQuery?: string
  networks?: Network[]
  maxTokensPerRequest?: number
}

interface FindTokensOptions {
  networks?: Network[]
  maxTokensPerRequest?: number
}

/**
 * SDK extension that provides token search, import, and balance‑retrieval
 * via the SafeBlock API.
 *
 * Requires the following extension:
 * - `TokensListExtension`
 */
export default class TokensExtension extends SdkExtension {
  static override name = "TokensExtension"

  public readonly events = {}

  private _fetchedBalances: Map<string, IBalanceData[]> = new Map()

  private _currentTask: string

  /**
   * SDK extension that provides token search, import, and balance‑retrieval
   * via the SafeBlock API.
   *
   * Requires the following extension:
   * - `TokensListExtension`
   *
   * @param {SafeBlock}                        sdk      SDK instance
   * @param {SdkConfig}                        config   SDK configuration
   */
  constructor(private readonly sdk: SafeBlock, private readonly config: SdkConfig) {
    super()

    this._currentTask = Math.random().toFixed()
  }

  public onInitialize(): void {}

  /** Reset the current task and clear the balance store */
  public reset() {
    this._fetchedBalances.clear()
    this._currentTask = Math.random().toFixed()
  }

  /**
   * Get the balance of a specific token.
   *
   * @param {Address}   of    account address
   * @param {BasicToken} token token to query
   * @returns {Amount} token balance
   */
  public balanceOf(of: Address, token: BasicToken): Amount {
    return this._fetchedBalances
        .get(of.toString())?.find(b => b.address.equalTo(token.address) && b.network === token.network.name)?.balance
      ?? Amount.from(0, 18, true)
  }

  /**
   * Search for external tokens using the SafeBlock API.
   *
   * @param {string}            query   symbol, address, or name
   * @param {FindTokensOptions} options search options
   * @returns {Promise<BasicToken[] | null>} found tokens or `null` on error
   */
  public async findTokens(query: string, options?: FindTokensOptions): Promise<BasicToken[] | null> {
    const task = Math.random().toFixed()
    this._currentTask = task

    return this.fetchTokens({
      searchQuery: query,
      networks: options?.networks ? options?.networks : Array.from(evmNetworksList),
      maxTokensPerRequest: options?.maxTokensPerRequest ?? 20
    }).then(async foundTokens => {
      if (task !== this._currentTask) return null

      return foundTokens
    }).catch(() => null)
  }

  /**
   * Update balances of all registered tokens for a given account.
   *
   * @param {Address} of account to update
   * @returns {Promise<void>}
   */
  public async fetchBalances(of: Address): Promise<void> {
    const tokensListExtension = this.sdk.extension(TokensListExtension)

    if (this.sdk.extension(TokensListExtension).tokensList.length === 0) return

    const balances = await fetchAccountBalances(of, tokensListExtension.tokensList)

    if (!this._fetchedBalances.has(of.toString())) this._fetchedBalances.set(of.toString(), [])

    const balanceRef: IBalanceData[] = []

    balances.forEach(balanceData => {
      const index = balanceRef
        .findIndex(b => b.address.equalTo(balanceData.address) && b.network === balanceData.network) ?? -1
      if (index !== -1) {
        balanceRef[index] = balanceData
        return
      }

      balanceRef.unshift(balanceData)
    })

    this._fetchedBalances.set(of.toString(), balanceRef.slice(0, 5000))
  }

  /**
   * Shortcut that scopes `balanceOf` and `fetchBalances`
   * to operate on a specific account.
   *
   * @param {Address} of account address
   */
  public as(of: Address) {
    const parent = this

    return {
      balanceOf: (token: BasicToken) => parent.balanceOf(of, token),
      fetchBalances: () => parent.fetchBalances(of)
    }
  }

  private async fetchTokens(options: FetchTokensOptions): Promise<BasicToken[]> {
    const filters = new URLSearchParams()

    // Insert text query search if possible
    if (options.searchQuery && options.searchQuery.trim().length > 0)
      filters.set("search", options.searchQuery.trim())

    // Insert network filters, joined with comma if there is some
    if (options.networks && options.networks.length > 0)
      filters.set("networks", options.networks.map(net => networkToSafeblockMap(this.config).get(net.name)).join(","))

    // Default filters
    filters.set("limit", (options.maxTokensPerRequest ?? 10).toString(10))

    const response = await request<{ items: BackendToken[] }>({
      base: this.config.backend?.url ?? publicBackendURL,
      method: "GET",
      path: `/tokens?${ filters.toString() }`
    })

    if (!response) return []

    return arrayUtils.nonNullable(
      response.items.map(token => {
        const network = safeblockToNetworkMap(this.config).get(token.network)
        if (!network) return null

        return {
          name: token.name,
          network,
          address: Address.from(token.address),
          icon: token.image_path ? `https://safeblock.sfo3.digitaloceanspaces.com/${ token.image_path }` : "",
          symbol: token.symbol,
          decimals: token.decimals
        }
      })
    ).filter(t => typeof (t.decimals as any) === "number" && t.decimals > 0)
  }
}
