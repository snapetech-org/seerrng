const priorityJobs = [
  'Director',
  'Creator',
  'Screenplay',
  'Writer',
  'Composer',
  'Editor',
  'Producer',
  'Co-Producer',
  'Executive Producer',
  'Animation',
];

export const sortCrewPriority = <T extends { job: string }>(crew: T[]): T[] =>
  crew
    .filter((person) => priorityJobs.includes(person.job))
    .sort((a, b) => {
      const aScore = priorityJobs.findIndex((job) => job.includes(a.job));
      const bScore = priorityJobs.findIndex((job) => job.includes(b.job));
      return aScore - bScore;
    });
