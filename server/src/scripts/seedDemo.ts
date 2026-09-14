import fs from 'fs';
import path from 'path';
import { connectDatabase, disconnectDatabase } from '../config/db';
import { Admin } from '../models/Admin';
import { Election } from '../models/Election';
import { Position } from '../models/Position';
import { Candidate } from '../models/Candidate';
import { Student } from '../models/Student';
import { importStudents } from '../services/student.service';
import { DEFAULT_POSITIONS, ELECTION_STATUS, CANDIDATE_STATUS, ROLES } from '../config/constants';
import { slugify } from '../utils/tokens';
import { logger } from '../utils/logger';

const AMR_SAMPLE_CSV = path.join(process.cwd(), 'data', 'amr-voters-sample.csv');
const LEGACY_SAMPLE_CSV = path.join(process.cwd(), 'data', 'students-sample.csv');

/**
 * Seeds the AMR Club BUK 2026 election:
 * - Creates the AMR IEC super admin
 * - Imports accredited voters from amr-voters-sample.csv
 * - Creates "AMR Club BUK General Election 2026"
 * - Seeds the 12 official AMR positions
 * - Seeds the 11 verified candidates under their respective positions
 */
async function seedDemo(): Promise<void> {
  await connectDatabase();

  const admin =
    (await Admin.findOne({ role: ROLES.SUPER_ADMIN })) ||
    (await Admin.create({
      username: 'amriec_admin',
      fullName: 'AMR IEC Super Admin',
      password: 'amriec2026',
      role: ROLES.SUPER_ADMIN,
      isActive: true,
    }));

  // 1) Import voters from the sample roster CSV
  const csvFile = fs.existsSync(AMR_SAMPLE_CSV)
    ? AMR_SAMPLE_CSV
    : fs.existsSync(LEGACY_SAMPLE_CSV)
      ? LEGACY_SAMPLE_CSV
      : null;

  if (csvFile) {
    const buffer = fs.readFileSync(csvFile);
    const fileName = path.basename(csvFile);
    const outcome = await importStudents(buffer, admin.id, fileName, undefined, {
      activateImmediately: true,
      updateExisting: true,
    });
    logger.info(
      `Sample voter import (${fileName}): inserted ${outcome.inserted}, updated ${outcome.updated}, invalid ${outcome.invalid}, skipped ${outcome.skipped}`,
    );
  } else {
    logger.warn('No sample CSV found at data/amr-voters-sample.csv — skipping voter import.');
  }

  // 2) Create the AMR Club BUK General Election 2026
  const title = 'AMR Club BUK General Election 2026';
  const slug = slugify(title);
  let election = await Election.findOne({ slug });

  const isDemoLive = process.env.DEMO_ACTIVE === 'true';
  const now = new Date();
  // Official election window: Monday, 14 September 2026, 08:00 WAT - 18:00 WAT (WAT = UTC+1)
  const officialStart = new Date('2026-09-14T07:00:00.000Z');
  const officialEnd = new Date('2026-09-14T17:00:00.000Z');

  const startDateTime = isDemoLive ? new Date(now.getTime() - 60 * 60 * 1000) : officialStart;
  const endDateTime = isDemoLive ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : officialEnd;
  const status = isDemoLive ? ELECTION_STATUS.ACTIVE : ELECTION_STATUS.SCHEDULED;

  if (!election) {
    election = await Election.create({
      title,
      slug,
      description:
        'Official general election for the Antimicrobial Resistance (AMR) Club, Bayero University Kano. Elect your executive leadership for the 2026/2027 tenure.',
      startDateTime,
      endDateTime,
      status,
      liveResultsEnabled: false,
      finalResultsPublished: false,
      registrationEnabled: true,
      votingEnabled: true,
      requireCandidateApproval: true,
      instructions:
        'Select your preferred candidate for each position. Review your ballot carefully before submitting. Voting is final and anonymous, protected by cryptographic ballot receipts.',
      eligibleDepartments: [],
      createdBy: admin.id,
    });
    logger.info(`Created election "${title}".`);
  }

  // 3) Seed the 12 official AMR positions
  const existingPositions = await Position.countDocuments({ electionId: election._id });
  if (existingPositions === 0) {
    await Position.insertMany(
      DEFAULT_POSITIONS.map((t, i) => ({
        electionId: election!._id,
        title: t,
        displayOrder: i,
        maxCandidates: 10,
        maxVotesPerVoter: 1,
        isActive: true,
      })),
    );
    logger.info(`Seeded ${DEFAULT_POSITIONS.length} positions.`);
  }

  // 4) Map positions for candidate insertion
  const allPositions = await Position.find({ electionId: election._id });
  const posMap = new Map<string, string>();
  const canonPos = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  allPositions.forEach((p) => {
    posMap.set(p.title, p.id);
    posMap.set(canonPos(p.title), p.id);
  });

  // Authoritative candidates list
  const candidatesData = [
    {
      positionTitle: 'President',
      fullName: 'Abubakar Abubakar Salmanu',
      campaignSlogan: 'Advancing AMR Awareness with Purpose and Vision',
      manifesto:
        'I am dedicated to expanding the impact of the AMR Club across Bayero University Kano, fostering multidisciplinary collaboration, and driving community health initiatives.',
      displayOrder: 0,
    },
    {
      positionTitle: 'President',
      fullName: 'Salim Sani Haladu',
      campaignSlogan: 'Inclusive Leadership, Global AMR Action',
      manifesto:
        'My goal is to strengthen student research, organize international antimicrobial stewardship workshops, and build active partnerships across faculties.',
      displayOrder: 1,
    },
    {
      positionTitle: 'Secretary-General',
      fullName: 'Ismail Hamza',
      campaignSlogan: 'Efficiency, Transparency, and Service',
      manifesto:
        'I will ensure precise documentation, seamless administrative correspondence, and active member engagement for all AMR Club activities.',
      displayOrder: 0,
    },
    {
      positionTitle: 'Assistant Secretary-General',
      fullName: 'Aisha Idris Saeed',
      campaignSlogan: 'Diligent Coordination, Reliable Support',
      manifesto:
        'I will support the Secretariat in maintaining accurate member records, minutes, and operational workflows.',
      displayOrder: 0,
    },
    {
      positionTitle: 'Financial Secretary',
      fullName: 'Ridwan Adewale Ajibade',
      campaignSlogan: 'Prudence and Accountable Financial Management',
      manifesto:
        'I will provide transparent financial records, timely budgeting, and diligent fiscal accountability.',
      displayOrder: 0,
    },
    {
      positionTitle: 'Treasurer',
      fullName: 'Abdulhamid Sagir Sulaiman',
      campaignSlogan: 'Integrity and Sound Fiscal Stewardship',
      manifesto:
        'Committed to safeguarding club funds, ensuring transparent disbursement, and maintaining verified ledgers.',
      displayOrder: 0,
    },
    {
      positionTitle: 'Director of Programs and Outreach',
      fullName: 'Sani Hafizu Haruna Kabara',
      campaignSlogan: 'Impactful Outreach, Resilient Communities',
      manifesto:
        'I will organize community antimicrobial awareness campaigns, hospital outreaches, and campus symposiums.',
      displayOrder: 0,
    },
    {
      positionTitle: 'Deputy Director of Programs and Outreach',
      fullName: 'Abubakar Basiru',
      campaignSlogan: 'Grassroots Engagement and Practical Action',
      manifesto:
        'I will assist in coordinating logistics, student volunteer mobilization, and educational field programs.',
      displayOrder: 0,
    },
    {
      positionTitle: 'Research Coordinator',
      fullName: 'Ibrahim Garba Mustapha',
      campaignSlogan: 'Evidence-Based Solutions for Antimicrobial Resistance',
      manifesto:
        'Dedicated to promoting student research papers, surveillance studies, and inter-faculty academic forums.',
      displayOrder: 0,
    },
    {
      positionTitle: 'Public Relations Officer I',
      fullName: 'Badaru Idris Abdullahi',
      campaignSlogan: 'Amplifying the Voice of Antimicrobial Stewardship',
      manifesto:
        'I will drive digital advocacy, press releases, and creative media campaigns across campus and social networks.',
      displayOrder: 0,
    },
    {
      positionTitle: 'Editor-in-Chief',
      fullName: 'Abdullah Kabir Olalekan',
      campaignSlogan: 'Excellence in Scientific Communication and Publishing',
      manifesto:
        'I will oversee the editorial board, club newsletter, research bulletins, and public health writing.',
      displayOrder: 0,
    },
  ];

  // Drop obsolete index if it exists from older schema versions
  try {
    await Candidate.collection.dropIndex('electionId_1_positionId_1_registrationNumber_1');
  } catch {
    /* index might not exist */
  }

  for (const c of candidatesData) {
    const positionId = posMap.get(c.positionTitle) || posMap.get(canonPos(c.positionTitle));
    if (!positionId) continue;

    const exists = await Candidate.findOne({
      electionId: election._id,
      positionId,
      fullName: c.fullName,
    });

    if (!exists) {
      await Candidate.create({
        electionId: election._id,
        positionId,
        fullName: c.fullName,
        campaignSlogan: c.campaignSlogan,
        manifesto: c.manifesto,
        status: CANDIDATE_STATUS.APPROVED,
        displayOrder: c.displayOrder,
      });
    }
  }
  logger.info('AMR Club candidates ensured.');

  const voterCount = await Student.countDocuments();
  logger.info(`Done. Total voters in DB: ${voterCount}.`);
  logger.info('Voters can register at /register with their accredited email address.');

  await disconnectDatabase();
}

seedDemo().catch((err) => {
  logger.error('Demo seed failed', err);
  process.exit(1);
});
