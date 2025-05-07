export enum SdkExceptionCode {
  /** The current task was cancelled */
  Aborted,

  /** An incorrectly‑formed swap request was passed to a relevant method.
   *
   * Most often happens when wrap/unwrap requests are routed to the cross‑chain module
   */
  InvalidRequest,

  /** Cross‑chain‑module error that occurs when the module
   * receives a same‑network swap request
   */
  SameNetwork,

  /** Pre‑processing error.
   *
   * The SDK failed to locate the base token (USDC) in the token list,
   * which makes route calculation on the specified network impossible
   */
  NoBaseTokenFound,

  /** Swap routes for the request were either not found
   * or none of them passed simulation
   */
  RoutesNotFound,

  /** Critical route‑simulation error.
   *
   * Triggered when the number of input tokens doesn’t match the outputs
   */
  SimulationFailed,

  /** Internal error while processing a swap request.
   *
   * Often caused by a failure to estimate the gas required for
   * a cross‑chain swap
   */
  InternalError,

  /** Error thrown only by `prepareEthersTransaction`.
   *
   * Raised when an ethers‑compatible transaction cannot be prepared
   */
  TransactionPrepareError,

  /** Extension‑initialization error.
   *
   * Occurs when an extension’s `onInitialize` method throws.
   *
   * Can be suppressed with `allowExtensionsInitErrors: true`; in that case,
   * all extensions that failed to initialize are disabled, but the SDK continues to work
   */
  ExtensionInitError,

  /** Requested extension not found.
   *
   * Raised when attempting to access an extension that wasn’t loaded into
   * the SDK or was disabled during initialization
   */
  ExtensionError
}

/**
 * Standard SDK error class
 */
export default class SdkException extends Error {
  public readonly code: number

  /**
   * Standard SDK error class
   *
   * @param {string} message error message
   * @param {SdkExceptionCode} code error code from `SdkExceptionCode`
   */
  constructor(message: string, code: SdkExceptionCode) {
    super(message)

    this.code = code
  }
}
