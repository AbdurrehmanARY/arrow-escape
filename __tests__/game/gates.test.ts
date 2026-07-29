/**
 * Walls, colour groups, gates and shutters.
 *
 * This file exists to pin the one design decision Phase 15 turned on, because it
 * is the only decision in the project that can change what kind of game this is.
 *
 * `docs/MECHANIC_ANALYSIS.md` closes by naming exactly one thing that would
 * invalidate the entire difficulty model: *"if a future mechanic ever lets a
 * blocked arrow move — even a single cell — order starts to matter, deadlock
 * becomes real, and the entire difficulty model here has to be rebuilt."* A
 * `shuts` gate is the same hazard by a different route. It does not move an arrow;
 * it lets a tap **take a route away**, which has the identical consequence.
 *
 * So the two rule sets are tested as two different games:
 *
 * - With walls and `opens` gates, everything the original analysis proved still
 *   holds. Tap order cannot lose, greedy always works, `stuck` is unreachable.
 *   These tests are the same properties as `mechanic-invariants.test.ts`, re-run
 *   on boards that carry obstacles.
 * - With a `shuts` gate, order matters, and that is demonstrated rather than
 *   asserted: the same board is won by one order and deadlocked by another.
 *
 * If someone ever makes gates monotone by accident, the shutter tests fail. If
 * someone makes plain boards non-monotone by accident, the gate tests fail.
 */

import {
  analyze,
  applyOutcome,
  blockedArrows,
  buildLevel,
  castRay,
  isDoomed,
  isSolvable,
  legalMoves,
  parseAscii,
  renderAscii,
  resolveTap,
  solve,
  solveBruteForce,
  startSession,
  tapArrow,
} from '@game';
import { buildWith, randomGatedLevel, seededRandom } from '../helpers';

/**
 * Two snakes stacked, with a gate in front of the upper one.
 *
 * `a` (lower) wears the colour; `b` (upper) has to cross the gate. Whether that
 * makes the level a forced order or a trap depends entirely on the gate's mode,
 * which is the point of using one picture for both.
 */
const STACK = `
  b B 0
  a A .
`;

const opensBoard = () =>
  buildWith(STACK, { groups: { a: 'red' }, gates: [{ group: 'red', mode: 'opens' }] });

const shutsBoard = () =>
  buildWith(STACK, { groups: { a: 'red' }, gates: [{ group: 'red', mode: 'shuts' }] });

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

describe('walls', () => {
  it('stop a ray, and say so', () => {
    const { board, initial } = buildWith('a A #', {});
    const ray = castRay(board, initial, 0);

    expect(ray.blockedBy).toBe('wall');
    expect(ray.blockerArrow).toBe(-1);
    expect(ray.blockedAt).toBe(2);
  });

  it('make a level unsolvable, and the reason names the real problem', () => {
    const { board, initial } = buildWith('a A #', {});
    const outcome = solve(board, initial);

    expect(outcome.kind).toBe('unsolvable');
    // "cycle" would be actively misleading here — there is only one arrow.
    if (outcome.kind === 'unsolvable') expect(outcome.reason).toContain('never reach an edge');
  });

  it('do not block an arrow pointing away from them', () => {
    const { board, initial } = buildWith('# a A', {});
    expect(castRay(board, initial, 0).blockedBy).toBe('nothing');
    expect(isSolvable(board, initial)).toBe(true);
  });

  it('are rejected when authored on top of an arrow', () => {
    const level = parseAscii('a A .', {});
    const result = buildLevel({ ...level, walls: [[0, 0]] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('wall sits on arrow');
  });
});

// ---------------------------------------------------------------------------
// `opens` gates — depth without risk
// ---------------------------------------------------------------------------

describe('an `opens` gate', () => {
  it('blocks until its colour has left the board', () => {
    const { board, initial } = opensBoard();
    const ray = castRay(board, initial, 1);

    expect(ray.blockedBy).toBe('gate');
    expect(board.groups[ray.blockerGroup]).toBe('red');
    expect(legalMoves(board, initial)).toEqual([0]);
  });

  it('lifts the moment the last arrow of that colour goes', () => {
    const { board, initial } = opensBoard();
    const after = applyOutcome(initial, resolveTap(board, initial, 0));

    expect(castRay(board, after, 1).blockedBy).toBe('nothing');
    expect(legalMoves(board, after)).toEqual([1]);
  });

  it('forces the tap order without ever making it losable', () => {
    const { board, initial } = opensBoard();
    const outcome = solve(board, initial);

    expect(outcome).toEqual({ kind: 'solved', solution: [0, 1] });
    expect(analyze(board, initial).dependencyDepth).toBe(2);
  });

  it('costs a heart when tapped early, and changes nothing else', () => {
    const { board, initial } = opensBoard();
    const session = startSession(initial, 5);
    const { session: after, outcome } = tapArrow(board, session, 1);

    expect(outcome.kind).toBe('blocked');
    if (outcome.kind === 'blocked') {
      // The screen needs all three to explain itself: it was a gate, not a snake,
      // and this is the colour that would lift it.
      expect(outcome.blockerKind).toBe('gate');
      expect(outcome.blockerIndex).toBe(-1);
      expect(board.groups[outcome.blockerGroup]).toBe('red');
    }
    expect(after.heartsLeft).toBe(4);
    expect(after.state).toBe(initial);
    expect(after.status).toBe('playing');
  });

  it('is rejected when it names a colour no arrow wears', () => {
    // Such a gate can never change state, so it is a wall written the long way —
    // always a typo, and one that would otherwise ship as an unsolvable level.
    const level = parseAscii(STACK, { gates: [{ group: 'red', mode: 'opens' }] });
    const result = buildLevel(level);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('could never open or shut');
  });
});

describe('`opens` gates leave the original guarantees intact', () => {
  it('an arrow that can leave now can still leave after any other arrow goes', () => {
    const rng = seededRandom(90210);
    let observations = 0;

    for (let trial = 0; trial < 500; trial += 1) {
      const level = randomGatedLevel(
        rng,
        { rows: 4, cols: 4, arrowCount: 3 + Math.floor(rng() * 3), maxBodyLength: 4 },
        'opens',
      );
      const built = buildLevel(level);
      if (!built.ok) continue;
      const { board, initial } = built.value;

      const freeBefore = legalMoves(board, initial);
      for (const removed of freeBefore) {
        const after = applyOutcome(initial, resolveTap(board, initial, removed));
        for (const stillThere of freeBefore) {
          if (stillThere === removed) continue;
          if (castRay(board, after, stillThere).blockedBy !== 'nothing') {
            throw new Error(
              `removing arrow ${removed} blocked arrow ${stillThere}:\n` +
                renderAscii(board, initial),
            );
          }
          observations += 1;
        }
      }
    }

    expect(observations).toBeGreaterThan(200);
  });

  it('random play always clears a solvable board', () => {
    const rng = seededRandom(31415);
    let boardsPlayed = 0;

    for (let trial = 0; trial < 500; trial += 1) {
      const level = randomGatedLevel(
        rng,
        { rows: 4, cols: 4, arrowCount: 3 + Math.floor(rng() * 3), maxBodyLength: 4 },
        'opens',
      );
      const built = buildLevel(level);
      if (!built.ok) continue;
      const { board, initial } = built.value;
      if (!isSolvable(board, initial)) continue;

      boardsPlayed += 1;
      let current = initial;
      while (current.remaining > 0) {
        const moves = legalMoves(board, current);
        if (moves.length === 0) {
          throw new Error(
            `greedy play stalled on a solvable board:\n${renderAscii(board, initial)}`,
          );
        }
        const pick = moves[Math.floor(rng() * moves.length)]!;
        current = applyOutcome(current, resolveTap(board, current, pick));
      }
    }

    expect(boardsPlayed).toBeGreaterThan(50);
  });

  it('never reports `stuck`, because it cannot happen', () => {
    const { board, initial } = opensBoard();
    let session = startSession(initial, 5);

    for (const index of [1, 1, 0, 1]) {
      session = tapArrow(board, session, index).session;
      expect(session.status).not.toBe('stuck');
    }
    expect(session.status).toBe('won');
    expect(board.hasShutters).toBe(false);
  });

  it('leaves the blunder rate at zero — no legal tap can be a mistake', () => {
    const { board, initial } = opensBoard();
    const metrics = analyze(board, initial);

    expect(metrics.orderMatters).toBe(false);
    expect(metrics.blunderRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// `shuts` gates — the mechanic that makes order matter
// ---------------------------------------------------------------------------

describe('a `shuts` gate', () => {
  it('is open while its colour is still on the board', () => {
    const { board, initial } = shutsBoard();

    expect(board.hasShutters).toBe(true);
    expect(castRay(board, initial, 1).blockedBy).toBe('nothing');
    expect(legalMoves(board, initial)).toEqual([0, 1]);
  });

  it('seals permanently once the last of that colour leaves', () => {
    const { board, initial } = shutsBoard();
    const after = applyOutcome(initial, resolveTap(board, initial, 0));

    const ray = castRay(board, after, 1);
    expect(ray.blockedBy).toBe('gate');
    expect(blockedArrows(board, after)).toEqual([1]);
  });

  it('makes the same board winnable in one order and lost in the other', () => {
    // The whole claim, in one test. Both arrows are free at the start, so this is
    // a genuine choice rather than a forced sequence — and one of the two options
    // throws the level away.
    const winning = shutsBoard();
    let session = startSession(winning.initial, 5);
    session = tapArrow(winning.board, session, 1).session; // b crosses while it can
    session = tapArrow(winning.board, session, 0).session;
    expect(session.status).toBe('won');

    const losing = shutsBoard();
    let doomed = startSession(losing.initial, 5);
    doomed = tapArrow(losing.board, doomed, 0).session; // a first — the shutter falls
    expect(doomed.status).toBe('stuck');
    // Note what the player has *not* lost: hearts. The board is unwinnable and
    // they were never charged for it, which is exactly why `stuck` cannot be
    // folded into `failed`.
    expect(doomed.heartsLeft).toBe(5);
  });

  it('is solved in the order that keeps the shutter open', () => {
    const { board, initial } = shutsBoard();
    expect(solve(board, initial)).toEqual({ kind: 'solved', solution: [1, 0] });
  });

  it('reports a non-zero blunder rate, which nothing else in the game can', () => {
    const { board, initial } = shutsBoard();
    const metrics = analyze(board, initial);

    expect(metrics.orderMatters).toBe(true);
    // One of the two opening taps loses the board; the closing tap cannot.
    expect(metrics.blunderRate).toBeCloseTo(0.25, 6);
  });

  it('is caught by `isDoomed` the moment the level becomes unwinnable', () => {
    const { board, initial } = shutsBoard();
    expect(isDoomed(board, initial)).toBe(false);

    const afterBlunder = applyOutcome(initial, resolveTap(board, initial, 0));
    expect(isDoomed(board, afterBlunder)).toBe(true);

    const afterGoodMove = applyOutcome(initial, resolveTap(board, initial, 1));
    expect(isDoomed(board, afterGoodMove)).toBe(false);
  });

  it('lets the last arrow of a colour leave through its own shutter', () => {
    // The shutter reads the board as it stands when the tap is resolved, so the
    // arrow that is about to close it is still holding it open for itself. Any
    // other rule would make some boards unwinnable for a reason no player could
    // possibly see.
    const { board, initial } = buildWith('a A 0 .', {
      groups: { a: 'red' },
      gates: [{ group: 'red', mode: 'shuts' }],
    });

    expect(castRay(board, initial, 0).blockedBy).toBe('nothing');
    expect(solve(board, initial)).toEqual({ kind: 'solved', solution: [0] });
  });
});

describe('the shutter solver agrees with exhaustive search', () => {
  it('matches brute force on hundreds of random shutter boards', () => {
    // `searchSolve` orders its moves heuristically and memoises on the surviving
    // set, both of which could in principle throw away a winning line. Brute force
    // does neither, so agreement across many boards is the check that matters.
    const rng = seededRandom(271828);
    let solvable = 0;
    let unsolvable = 0;

    for (let trial = 0; trial < 400; trial += 1) {
      const level = randomGatedLevel(
        rng,
        { rows: 4, cols: 4, arrowCount: 3 + Math.floor(rng() * 3), maxBodyLength: 4 },
        'shuts',
      );
      const built = buildLevel(level);
      if (!built.ok) continue;
      const { board, initial } = built.value;
      if (!board.hasShutters) continue;

      const viaSearch = solve(board, initial).kind === 'solved';
      const viaBruteForce = solveBruteForce(board, initial);

      if (viaSearch !== viaBruteForce) {
        throw new Error(
          `solvers disagree (search=${viaSearch}, brute=${viaBruteForce}):\n` +
            renderAscii(board, initial),
        );
      }
      if (viaSearch) solvable += 1;
      else unsolvable += 1;
    }

    // Both verdicts must be well represented, or the agreement above proves
    // nothing more than that both functions can say "no".
    expect(solvable).toBeGreaterThan(20);
    expect(unsolvable).toBeGreaterThan(20);
  });

  it('finds boards where greedy play throws the level away', () => {
    // The counterpart to the `opens` test above: there, greedy always won. Here it
    // must sometimes lose, or shutters are not doing what they were added to do.
    const rng = seededRandom(161803);
    let solvableBoards = 0;
    let greedyFailures = 0;

    for (let trial = 0; trial < 600; trial += 1) {
      const level = randomGatedLevel(
        rng,
        { rows: 4, cols: 4, arrowCount: 3 + Math.floor(rng() * 3), maxBodyLength: 4 },
        'shuts',
      );
      const built = buildLevel(level);
      if (!built.ok) continue;
      const { board, initial } = built.value;
      if (!board.hasShutters || !isSolvable(board, initial)) continue;

      solvableBoards += 1;
      let current = initial;
      while (current.remaining > 0) {
        const moves = legalMoves(board, current);
        if (moves.length === 0) {
          greedyFailures += 1;
          break;
        }
        const pick = moves[Math.floor(rng() * moves.length)]!;
        current = applyOutcome(current, resolveTap(board, current, pick));
      }
    }

    expect(solvableBoards).toBeGreaterThan(20);
    expect(greedyFailures).toBeGreaterThan(0);
  });
});
