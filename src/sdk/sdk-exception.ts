export enum SdkExceptionCode {
  Aborted,
  InvalidRequest,
  SameNetwork,
  NoTetherFound,
  RoutesNotFound,
  SimulationFailed,
  InternalError,
  TransactionPrepareError,
  ExtensionInitError,
  ExtensionError
}

export default class SdkException extends Error {
  public readonly code: number

  constructor(message: string, code: SdkExceptionCode) {
    super(message)

    this.code = code
  }
}

