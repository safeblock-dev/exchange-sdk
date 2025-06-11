import CombinedSet from "~/utils/combined-set"

export default class StateManager {
  protected currentTask = Symbol()
  protected currentRequestController: AbortController | null = null

  public readonly dexBlacklist: CombinedSet<string> = new CombinedSet()

  public updateTask() {
    const task = Symbol()
    if (this.currentRequestController) this.currentRequestController.abort()

    this.currentRequestController = new AbortController()
    this.currentTask = task

    return task
  }

  public verifyTask(task: symbol) {
    if (this.currentRequestController?.signal.aborted) return false

    return this.currentTask === task
  }
}
