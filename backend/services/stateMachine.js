/**
 * Finite State Machine (FSM) for Server Health Status
 * 
 * States:
 *  - UNKNOWN : Initial state before any check is performed.
 *  - HEALTHY : Server responded with a successful HTTP status code (2xx).
 *  - DOWN    : Server request timed out, failed, or returned an error/non-2xx status.
 * 
 * Valid Transitions:
 *  - UNKNOWN -> HEALTHY (First check succeeded)
 *  - UNKNOWN -> DOWN    (First check failed)
 *  - HEALTHY -> DOWN    (Server crashed, timed out, or returned error)
 *  - DOWN -> HEALTHY    (Server recovered)
 *  - HEALTHY -> HEALTHY (Server remained operational)
 *  - DOWN -> DOWN       (Server remains unavailable)
 */

const STATES = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  HEALTHY: 'HEALTHY',
  DOWN: 'DOWN'
});

/**
 * Validates if a state string is one of the allowed FSM states
 * @param {string} state 
 * @returns {boolean}
 */
function isValidState(state) {
  return Object.values(STATES).includes(state);
}

/**
 * Determines the next state according to the FSM transition rules
 * 
 * @param {string} currentStatus - Current state of the server
 * @param {object|null} checkResult - Result of the HTTP health check { success: boolean, httpStatusCode: number }
 * @returns {string} The new state (HEALTHY, DOWN, or UNKNOWN)
 */
function determineNextState(currentStatus = STATES.UNKNOWN, checkResult = null) {
  if (!checkResult) {
    return STATES.UNKNOWN;
  }

  // A check is considered healthy strictly if HTTP status is 2xx and no network/timeout error occurred
  if (checkResult.success === true) {
    return STATES.HEALTHY;
  }

  // Any failure, timeout, non-2xx status code, or network error transitions the server to DOWN
  return STATES.DOWN;
}

/**
 * Evaluates state transition and provides transition metadata
 * 
 * @param {string} previousStatus 
 * @param {object} checkResult 
 * @returns {object} { previousStatus, currentStatus, hasChanged, transitionDescription }
 */
function computeTransition(previousStatus = STATES.UNKNOWN, checkResult) {
  const safePrevious = isValidState(previousStatus) ? previousStatus : STATES.UNKNOWN;
  const nextStatus = determineNextState(safePrevious, checkResult);
  const hasChanged = safePrevious !== nextStatus;

  let description = `${safePrevious} → ${nextStatus}`;
  if (hasChanged) {
    if (nextStatus === STATES.HEALTHY) {
      description += safePrevious === STATES.UNKNOWN ? ' (Initial connection verified)' : ' (Server recovered)';
    } else if (nextStatus === STATES.DOWN) {
      description += safePrevious === STATES.UNKNOWN ? ' (Initial check failed)' : ' (Health degradation detected)';
    }
  } else {
    description += ' (State maintained)';
  }

  return {
    previousStatus: safePrevious,
    currentStatus: nextStatus,
    hasChanged,
    transitionDescription: description
  };
}

module.exports = {
  STATES,
  isValidState,
  determineNextState,
  computeTransition
};
