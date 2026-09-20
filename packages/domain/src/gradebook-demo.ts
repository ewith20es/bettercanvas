import type { Gradebook, GradeCourse } from "./gradebook";
export function demoGradebook(periodIndex = 0): Gradebook {
  const periods = [
    { index: 0, name: "Quarter 1", start: "2026-08-25", end: "2026-10-30" },
    { index: 1, name: "Quarter 2", start: "2026-11-02", end: "2027-01-22" },
  ];
  const rows: [number, string, string, string, number, string][] = [
    [1, "Hon English 9A", "Angel Olivero", "P14", 94.5, "A"],
    [2, "Hon Spanish 3A", "Michela Corcorran", "163", 88, "B"],
    [3, "Photography 1A", "Kelly Crowder", "004", 97, "A"],
    [4, "Mag Functions A", "William Rose", "309", 84, "B"],
    [6, "Adv Sci1 Physics DP", "Evan Porch", "215", 92, "A"],
    [7, "Research Exp ProbSolv 1A", "Daniel Pedersen", "211", 96, "A"],
    [8, "Fnd Computer Sci A", "Steffany Koval", "328", 98, "A"],
    [9, "AP US History A", "Jennifer Rathmell", "242", 86.5, "B"],
  ];
  const courses: GradeCourse[] =
    periodIndex === 1
      ? []
      : rows.map(([period, name, teacher, room, percent, letter]) => ({
          id: `sample-${period}`,
          name,
          teacher,
          room,
          period,
          marks: [
            {
              name: "Quarter grade",
              letter,
              percent,
              categories: [
                {
                  name: "All Tasks / Assessments",
                  weight: 90,
                  earned: percent - 0.5,
                  possible: 100,
                  reportedGrade: letter,
                },
                {
                  name: "Practice / Preparation",
                  weight: 10,
                  earned: percent + 4.5,
                  possible: 100,
                  reportedGrade: "A",
                },
              ],
              assignments: [
                {
                  id: "1",
                  name:
                    period === 9
                      ? "Lessons 1–5: multiple-choice assessment"
                      : "Unit 1 assessment",
                  category: "All Tasks / Assessments",
                  due: "2026-09-18",
                  assigned: "2026-09-14",
                  earned: (percent - 0.5) / 2,
                  possible: 50,
                  score: `${percent - 0.5}%`,
                  notes: "",
                  excluded: false,
                  missing: false,
                },
                {
                  id: "2",
                  name:
                    period === 9
                      ? "Comparing colonial regions"
                      : "Classwork and application",
                  category: "All Tasks / Assessments",
                  due: "2026-09-16",
                  assigned: "2026-09-15",
                  earned: (percent - 0.5) / 2,
                  possible: 50,
                  score: `${percent - 0.5}%`,
                  notes: "",
                  excluded: false,
                  missing: false,
                },
                {
                  id: "3",
                  name: "Reading notes",
                  category: "Practice / Preparation",
                  due: "2026-09-15",
                  assigned: "2026-09-14",
                  earned: percent + 4.5,
                  possible: 100,
                  score: `${percent + 4.5}%`,
                  notes: "",
                  excluded: false,
                  missing: false,
                },
                {
                  id: "4",
                  name: "Next lesson preparation",
                  category: "Practice / Preparation",
                  due: "2026-09-21",
                  assigned: "2026-09-18",
                  earned: null,
                  possible: 10,
                  score: "Not Graded",
                  notes: "Awaiting a score from your teacher.",
                  excluded: false,
                  missing: false,
                },
                ...(period === 4
                  ? [
                      {
                        id: "5",
                        name: "Problem set reflection",
                        category: "Practice / Preparation",
                        due: "2026-09-17",
                        assigned: "2026-09-15",
                        earned: null,
                        possible: 5,
                        score: "Missing",
                        notes: "Missing",
                        excluded: false,
                        missing: true,
                      },
                    ]
                  : []),
              ],
            },
          ],
        }));
  return {
    source: "synergy",
    demo: true,
    fetchedAt: new Date().toISOString(),
    period: periods[periodIndex] ?? periods[0],
    periods,
    courses,
  };
}
