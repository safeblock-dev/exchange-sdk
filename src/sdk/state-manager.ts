import EventsManager from "~/sdk/events-manager"
import CombinedSet from "~/utils/combined-set"

export default class StateManager extends EventsManager {
  protected currentTask = Symbol()

  public readonly dexBlacklist: CombinedSet<string> = new CombinedSet()

  public updateTask() {
    const task = Symbol()

    this.currentTask = task

    return task
  }

  public verifyTask(task: symbol) {
    return this.currentTask === task
  }
}