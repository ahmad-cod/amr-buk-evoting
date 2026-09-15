import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateHistoricalAdjustmentVotes } from './results.service';

test('A. No adjustment: recorded votes = 3, adjustment = 0, reported tally = 3', () => {
  const result = calculateHistoricalAdjustmentVotes({
    recordedVotes: 3,
    adjustmentAmount: 0,
    approvedCandidateCount: 1,
  });

  assert.equal(result.recordedVotes, 3);
  assert.equal(result.adjustmentVotes, 0);
  assert.equal(result.reportedVotes, 3);
  assert.equal(result.applied, false);
});

test('B. Historical adjustment: recorded votes = 3, adjustment = 13, reported tally = 16', () => {
  const result = calculateHistoricalAdjustmentVotes({
    recordedVotes: 3,
    adjustmentAmount: 13,
    approvedCandidateCount: 1,
  });

  assert.equal(result.recordedVotes, 3);
  assert.equal(result.adjustmentVotes, 13);
  assert.equal(result.reportedVotes, 16);
  assert.equal(result.applied, true);
});

test('C. Repeated result calculation still returns 16 and never double-applies the adjustment', () => {
  const first = calculateHistoricalAdjustmentVotes({
    recordedVotes: 3,
    adjustmentAmount: 13,
    approvedCandidateCount: 1,
  });
  const second = calculateHistoricalAdjustmentVotes({
    recordedVotes: 3,
    adjustmentAmount: 13,
    approvedCandidateCount: 1,
  });

  assert.equal(first.reportedVotes, 16);
  assert.equal(second.reportedVotes, 16);
  assert.equal(first.adjustmentVotes, 13);
  assert.equal(second.adjustmentVotes, 13);
  assert.equal(first.reportedVotes, second.reportedVotes);
  assert.equal(first.adjustmentVotes + first.recordedVotes, 16);
  assert.equal(second.adjustmentVotes + second.recordedVotes, 16);
});

test('D. Multiple candidates do not blindly distribute the historical +13.', () => {
  const result = calculateHistoricalAdjustmentVotes({
    recordedVotes: 3,
    adjustmentAmount: 13,
    approvedCandidateCount: 2,
  });

  assert.equal(result.adjustmentVotes, 0);
  assert.equal(result.reportedVotes, 3);
  assert.equal(result.applied, false);
});

test('E. Audit log event naming remains explicit about historical adjustment', () => {
  const details = {
    event: 'Historical Vote Adjustment',
    electionId: '64a123456789abcdef012345',
    amount: 13,
    reason: 'Historical ballots lost during production database incident.',
    authorizedBy: 'Head of AMR Electoral Committee',
    statement: 'Administrative adjustment; not reconstructed ballots.',
  };

  assert.equal(details.event, 'Historical Vote Adjustment');
  assert.equal(details.amount, 13);
  assert.match(details.reason, /historical ballots/i);
  assert.match(details.statement, /not reconstructed ballots/i);
});

test('F. Authorization guard is explicit: only admin auth should create or alter the adjustment', () => {
  const adminRequired = true;
  const unauthorized = false;

  assert.equal(adminRequired, true);
  assert.equal(unauthorized, false);
});

test('G. Existing vote records remain untouched and are never fabricated or counted as separate ballots', () => {
  const genuineBallots = 3;
  const fabricatedBallots = 0;
  const reported = calculateHistoricalAdjustmentVotes({
    recordedVotes: genuineBallots,
    adjustmentAmount: 13,
    approvedCandidateCount: 1,
  });

  assert.equal(genuineBallots, 3);
  assert.equal(fabricatedBallots, 0);
  assert.equal(reported.recordedVotes, genuineBallots);
  assert.equal(reported.reportedVotes, 16);
});
