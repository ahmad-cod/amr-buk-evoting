import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { ok } from '../utils/respond';
import { Election } from '../models/Election';
import { computeResults } from '../services/results.service';
import { resultsVisibility } from '../services/election.service';

// Public results — respects live/final visibility toggles.
export const getPublicResults = asyncHandler(async (req: Request, res: Response) => {
  const election = await Election.findOne({ slug: req.params.slug });
  if (!election) throw ApiError.notFound('Election not found');

  const visibility = resultsVisibility(election);
  if (!visibility.visible) {
    return ok(res, {
      available: false,
      reason: visibility.reason,
      election: { title: election.title, slug: election.slug },
    });
  }

  const results = await computeResults(election);
  return ok(res, { available: true, ...results });
});

// Admin preview — always visible to admins regardless of toggles.
export const getAdminResults = asyncHandler(async (req: Request, res: Response) => {
  const election = await findById(req.params.id);
  const results = await computeResults(election);
  ok(res, { available: true, previewOnly: true, ...results });
});

// CSV export of tallies (no voter identities).
export const exportResults = asyncHandler(async (req: Request, res: Response) => {
  const election = await findById(req.params.id);
  const results = await computeResults(election);

  const lines: string[] = [];
  lines.push(`Election,${csv(results.election.title)}`);
  lines.push(`Status,${results.election.status}`);
  lines.push(`Eligible Voters,${results.turnout.eligibleVoters}`);
  lines.push(`Votes Cast,${results.turnout.votesCast}`);
  lines.push(`Turnout %,${results.turnout.turnoutPercentage}`);
  lines.push('');
  lines.push('Position,Candidate,Votes,Percentage,Winner');
  results.positions.forEach((p) => {
    p.candidates.forEach((c) => {
      lines.push(
        `${csv(p.title)},${csv(c.fullName)},${c.votes},${c.percentage},${c.isWinner ? 'YES' : ''}`,
      );
    });
  });

  const filename = `results-${results.election.slug}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\n'));
});

async function findById(id: string) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid election id');
  const election = await Election.findById(id);
  if (!election) throw ApiError.notFound('Election not found');
  return election;
}

function csv(v: string): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
