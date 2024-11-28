import { ton, tron } from "@safeblock/blockchain-utils"
import { JsonRpcSigner, Network } from "ethers"
import { TonAccount } from "~/types"
import CombinedSet from "~/utils/combined-set"

export default class StateManager {
  protected currentTask = Symbol()

  public readonly dexBlacklist: CombinedSet<string> = new CombinedSet()

  private tonAccount: TonAccount | null = null
  private ethereumAccount: JsonRpcSigner | null = null

  public connectTon(account: TonAccount | null) {
    this.tonAccount = account
  }

  public updateTask() {
    const task = Symbol()

    this.currentTask = task

    return task
  }

  public verifyTask(task: symbol) {
    return this.currentTask === task
  }

  public disconnectTon() {
    this.tonAccount = null
  }

  public connectEthereum(account: JsonRpcSigner | null) {
    this.ethereumAccount = account
  }

  public disconnectEthereum() {
    this.ethereumAccount = null
  }

  public getAccountAddress(network: Network): string | undefined {
    if (network.name === tron.name) return undefined
    if (network.name === ton.name) return this.tonAccount?.address

    return this.ethereumAccount?.address
  }
}