/**
 * NZQA Technology Curriculum Rubrics (Phase 4, Year 9-10)
 * 
 * Updated to align with official NZQA Technology Curriculum Achievement Standards
 * Reference: https://newzealandcurriculum.tahurangi.education.govt.nz/
 * 
 * Four comprehensive rubric presets for Year 9-10 programming/digital technology assessment
 */

const NZQA_RUBRICS = {
    programming_fundamentals: {
        title: "Programming Fundamentals (Year 9-10) - NZQA Standards",
        description: "Assessment aligned with NZQA Technology Curriculum Phase 4. Evaluates students' ability to plan, design, and implement programming solutions with consideration for digital citizenship.",
        total_points: 100,
        criteria: [
            {
                name: "Design Thinking & Planning (NZQA)",
                description: "Student demonstrates ability to identify design requirements, plan solutions, and document design thinking. Evidence: design brief analysis, pseudocode, flowcharts, design documentation.",
                points: 20,
                levels: {
                    0: "No evidence of planning or design thinking",
                    5: "Minimal planning; problem requirements unclear or missing",
                    10: "Basic problem analysis; simple design plan with gaps",
                    15: "Clear problem identification; logical design with mostly complete documentation",
                    20: "Comprehensive analysis of requirements; detailed design documentation; clear algorithmic representation"
                }
            },
            {
                name: "Computational Thinking & Programming Logic (NZQA)",
                description: "The program demonstrates correct logic and produces accurate output. Shows understanding of sequences, decisions (conditionals), repetition (loops), variables, and data types. Handles the specified problem requirements.",
                points: 25,
                levels: {
                    0: "Program does not run or demonstrates fundamental misunderstanding",
                    8: "Program runs but has significant logic errors or incomplete functionality",
                    15: "Program works with correct output for basic cases; some logic errors or incomplete edge case handling",
                    20: "Program produces correct output; good logical structure; handles most cases correctly",
                    25: "Program is correct and robust; handles edge cases; demonstrates sophisticated computational thinking"
                }
            },
            {
                name: "Code Implementation & Best Practices (NZQA)",
                description: "Code demonstrates good programming practices: meaningful variable naming, appropriate comments explaining logic, consistent formatting, use of functions/methods, and DRY principles (avoiding code duplication).",
                points: 20,
                levels: {
                    0: "No evidence of code quality; illegible or non-functional code",
                    5: "Poor variable naming; minimal/no comments; inconsistent or poor formatting",
                    10: "Adequate naming and comments; inconsistent formatting; limited use of functions",
                    15: "Good variable naming; helpful comments; consistent formatting; appropriate use of functions",
                    20: "Excellent code quality; clear naming conventions; comprehensive comments; well-organized structure; effective use of functions"
                }
            },
            {
                name: "Testing, Debugging & Validation (NZQA)",
                description: "Evidence of systematic testing with multiple test cases. Student identifies and fixes errors. Demonstrates understanding of edge cases and validates solution against requirements.",
                points: 15,
                levels: {
                    0: "No evidence of testing or debugging",
                    5: "Limited testing; errors not identified or fixed",
                    8: "Some testing performed; basic errors identified and addressed",
                    12: "Systematic testing with multiple test cases; most errors fixed; some edge cases considered",
                    15: "Comprehensive testing plan; thorough debugging; edge cases tested; validation against requirements documented"
                }
            },
            {
                name: "Digital Citizenship & Ethics (NZQA)",
                description: "Student demonstrates understanding of digital citizenship: appropriate use of code/resources, proper attribution of sources, consideration of accessibility and inclusivity, and ethical implications of solutions.",
                points: 10,
                levels: {
                    0: "No evidence of ethical consideration or attribution",
                    3: "Minimal attention to ethics; sources not acknowledged",
                    5: "Basic acknowledgment of sources; some ethical awareness",
                    8: "Good citation practices; considers accessibility; some ethical reflection",
                    10: "Excellent ethical awareness; proper attribution; accessibility-first approach; considers diverse user needs"
                }
            },
            {
                name: "Documentation & Communication (NZQA)",
                description: "Code documentation and supporting materials clearly explain the solution. Written explanations are clear, organized, and demonstrate understanding of the programming concepts used.",
                points: 10,
                levels: {
                    0: "No documentation or explanations provided",
                    3: "Minimal documentation; explanations unclear or incomplete",
                    5: "Basic documentation; explanations are somewhat clear",
                    8: "Good documentation; clear explanations; demonstrates understanding",
                    10: "Excellent documentation; comprehensive explanations; articulate demonstration of learning"
                }
            }
        ]
    },

    web_development: {
        title: "Web Development & Digital Design (Year 9-10) - NZQA Standards",
        description: "Assessment aligned with NZQA Technology Curriculum Phase 4. Evaluates students' ability to design and implement digital products considering user needs and digital citizenship.",
        total_points: 100,
        criteria: [
            {
                name: "User-Centered Design Thinking (NZQA)",
                description: "Design clearly addresses identified user needs and requirements. Evidence: user analysis, accessibility features, responsive design, usability considerations documented.",
                points: 15,
                levels: {
                    0: "No evidence of user consideration or requirements analysis",
                    5: "Minimal user focus; accessibility not considered",
                    8: "Basic user analysis; some accessibility features attempted",
                    12: "Good user focus; responsive design implemented; accessibility features present",
                    15: "Comprehensive user analysis; accessibility-first approach; responsive design; usability validated"
                }
            },
            {
                name: "HTML/CSS Technical Implementation (NZQA)",
                description: "Correct and semantic use of HTML elements. CSS demonstrates proficiency with layout techniques (flexbox/grid), responsive design principles, and styling best practices.",
                points: 20,
                levels: {
                    0: "Non-functional HTML or CSS; significant structural errors",
                    7: "Basic HTML structure; CSS not properly implemented; not responsive",
                    12: "Adequate semantic HTML; functional CSS layout; limited responsiveness",
                    16: "Good semantic HTML; solid CSS implementation; responsive design working",
                    20: "Excellent semantic HTML; sophisticated CSS; fully responsive across all devices; efficient code"
                }
            },
            {
                name: "JavaScript Functionality & Interactivity (NZQA)",
                description: "JavaScript used appropriately to enhance user experience. DOM manipulation, event handling, form validation, and user interactions working correctly and smoothly.",
                points: 20,
                levels: {
                    0: "No JavaScript or non-functional code with errors",
                    7: "JavaScript present with significant errors or limited functionality",
                    12: "Basic JavaScript functionality working; some features operational; minor bugs",
                    16: "Good JavaScript implementation; most features work well; smooth interactions",
                    20: "Excellent JavaScript; sophisticated interactions; proper error handling; smooth user experience"
                }
            },
            {
                name: "Digital Citizenship & Accessibility (NZQA)",
                description: "Website considers digital citizenship: WCAG accessibility guidelines, data privacy protection, ethical use of third-party content/APIs, inclusive design practices.",
                points: 15,
                levels: {
                    0: "No accessibility or privacy considerations; ethical concerns present",
                    5: "Minimal accessibility; privacy concerns; sources not attributed",
                    8: "Basic accessibility features; data privacy considered; some source attribution",
                    12: "Good accessibility (WCAG A); strong privacy practices; proper attribution; inclusive design",
                    15: "Exemplary accessibility (WCAG AA); privacy-first design; excellent attribution; universally accessible"
                }
            },
            {
                name: "Code Organization & Maintainability (NZQA)",
                description: "Code is well-organized with clear structure, logical naming, comments, and follows web development conventions. Code is maintainable and could be extended by others.",
                points: 15,
                levels: {
                    0: "Disorganized; illegible code; no comments",
                    5: "Poor organization; minimal comments; unclear naming",
                    8: "Basic organization; adequate comments; fair naming conventions",
                    12: "Good organization; helpful comments; consistent naming; follows conventions",
                    15: "Excellent organization; comprehensive documentation; professional code style; easily maintainable"
                }
            },
            {
                name: "Problem-Solving & Innovation (NZQA)",
                description: "Student demonstrates creative problem-solving, handles challenges and edge cases thoughtfully, potentially exceeds basic requirements with innovations.",
                points: 15,
                levels: {
                    0: "Does not meet basic requirements; fundamental issues",
                    5: "Meets basic requirements with difficulty; minimal problem-solving",
                    8: "Meets requirements; demonstrates basic problem-solving",
                    12: "Meets requirements well; good problem-solving; some creative enhancements",
                    15: "Exceeds requirements; sophisticated problem-solving; creative and thoughtful innovations"
                }
            }
        ]
    },

    data_structures_algorithms: {
        title: "Data Structures & Algorithms (Year 10) - NZQA Standards",
        description: "Assessment aligned with NZQA Technology Curriculum Phase 4. Evaluates students' understanding of computational efficiency and sophisticated algorithm design.",
        total_points: 100,
        criteria: [
            {
                name: "Algorithm Correctness & Efficiency (NZQA)",
                description: "Algorithm produces correct results and demonstrates consideration of computational efficiency. Student explains algorithmic choices and efficiency tradeoffs.",
                points: 25,
                levels: {
                    0: "Algorithm incorrect or non-functional; produces wrong output",
                    10: "Algorithm produces correct output but is inefficient",
                    15: "Correct with reasonable efficiency; some unnecessary operations",
                    20: "Correct and reasonably efficient; explains basic efficiency considerations",
                    25: "Correct and optimized; articulates efficiency tradeoffs; considers Big O complexity"
                }
            },
            {
                name: "Data Structure Selection & Usage (NZQA)",
                description: "Appropriate selection of data structures (arrays, lists, dictionaries, objects, sets). Demonstrates understanding of when and why each structure is appropriate.",
                points: 20,
                levels: {
                    0: "Incorrect or inappropriate data structures; fundamental misunderstanding",
                    7: "Uses structures but selection is not always appropriate",
                    12: "Generally appropriate data structure choices with minor inefficiencies",
                    16: "Good structure selection; explains reasoning for choices",
                    20: "Excellent structure selection; clearly justified; considers efficiency implications"
                }
            },
            {
                name: "Code Quality & Implementation (NZQA)",
                description: "Code is clean, readable, and maintainable with meaningful names, helpful comments, and clear structure. Follows programming standards and best practices.",
                points: 15,
                levels: {
                    0: "Disorganized; illegible; no documentation",
                    5: "Poor quality; minimal documentation; unclear structure",
                    8: "Acceptable quality; basic comments; reasonable structure",
                    12: "Good quality; helpful documentation; consistent style; well-organized",
                    15: "Excellent quality; comprehensive documentation; professional standards; exemplary structure"
                }
            },
            {
                name: "Testing, Validation & Edge Cases (NZQA)",
                description: "Demonstrates systematic testing with multiple test cases. All edge cases identified and properly handled. Error conditions managed gracefully.",
                points: 15,
                levels: {
                    0: "No testing evidence; edge cases not considered",
                    5: "Limited testing; many edge cases untested",
                    8: "Basic testing performed; some edge cases covered",
                    12: "Comprehensive testing; most edge cases handled; proper error handling",
                    15: "Thorough testing; all edge cases considered; robust error handling; validation documented"
                }
            },
            {
                name: "Computational Thinking & Analysis (NZQA)",
                description: "Student demonstrates deep understanding of computational principles. Can analyze performance, explain design decisions, and reflect on improvements and alternatives.",
                points: 15,
                levels: {
                    0: "No analysis or demonstration of understanding",
                    5: "Minimal analysis; shows limited understanding of concepts",
                    8: "Basic analysis; demonstrates some understanding; limited reflection",
                    12: "Good analysis; clear understanding; reflects on performance",
                    15: "Excellent analysis; demonstrates sophisticated understanding; thoughtful reflection on alternatives"
                }
            },
            {
                name: "Digital Citizenship & Academic Integrity (NZQA)",
                description: "Proper attribution of algorithms and code from external sources. Demonstrates understanding of security implications and ethical considerations in programming.",
                points: 10,
                levels: {
                    0: "No attribution; ethical concerns present; security not considered",
                    3: "Minimal attribution; limited ethical awareness",
                    5: "Basic attribution; some ethical and security awareness",
                    8: "Good attribution practices; security considerations noted",
                    10: "Excellent attribution; comprehensive ethical and security analysis; demonstrates integrity"
                }
            }
        ]
    },

    capstone_project: {
        title: "Capstone/Integrated Project (Year 10) - NZQA Standards",
        description: "Assessment aligned with NZQA Technology Curriculum Phase 4. Evaluates comprehensive technology project demonstrating design thinking, problem-solving, and digital citizenship.",
        total_points: 100,
        criteria: [
            {
                name: "Project Planning & Management (NZQA)",
                description: "Clear project scope, realistic timeline, and defined deliverables. Evidence of planning tools (timelines, milestones). Demonstrates adaptability and responsiveness to changes.",
                points: 15,
                levels: {
                    0: "No planning evident; chaotic approach",
                    5: "Minimal planning; poor organization; unrealistic timeline",
                    8: "Basic planning documented; some structure; scope somewhat unclear",
                    12: "Good planning; clear timeline; defined milestones; some adaptability shown",
                    15: "Excellent planning; professional project management; responsive to changes; realistic milestones"
                }
            },
            {
                name: "Technical Implementation & Integration (NZQA)",
                description: "Technical solution demonstrates mastery of relevant concepts. Multiple technologies integrated effectively. Demonstrates sophisticated computational thinking.",
                points: 25,
                levels: {
                    0: "Does not function; fails to demonstrate technical competence",
                    10: "Functional but with significant issues; demonstrates basic technical skills",
                    15: "Works reasonably well; good technical implementation; some challenges remain",
                    20: "Strong technical execution; well-integrated technologies; demonstrates solid mastery",
                    25: "Excellent technical implementation; sophisticated technology integration; demonstrates advanced mastery"
                }
            },
            {
                name: "Design Thinking & User Experience (NZQA)",
                description: "Product design is user-centered, intuitive, and visually professional. Evidence of user research or feedback integration. Demonstrates design thinking principles.",
                points: 15,
                levels: {
                    0: "Poor design; difficult or impossible to use",
                    5: "Basic design; significant usability issues",
                    8: "Adequate design; mostly usable; some issues",
                    12: "Good design; user-focused; intuitive navigation; professional appearance",
                    15: "Excellent design; intuitive UX; tested with users; professional and engaging; accessible"
                }
            },
            {
                name: "Problem-Solving & Innovation (NZQA)",
                description: "Student demonstrates sophisticated problem-solving approach. Identifies and solves complex problems. Potentially offers novel solutions or meaningful enhancements.",
                points: 15,
                levels: {
                    0: "Does not address core problem; fundamental issues",
                    5: "Addresses problem but in basic way; limited thinking",
                    8: "Good problem-solving; some creative thinking",
                    12: "Strong problem-solving; creative approach; handles complexity well",
                    15: "Excellent problem-solving; innovative features; sophisticated approach to challenges"
                }
            },
            {
                name: "Documentation & Communication (NZQA)",
                description: "Comprehensive project documentation including design rationale, user guides, code comments, and technical documentation. Clear communication of decisions and learning.",
                points: 15,
                levels: {
                    0: "No documentation provided",
                    5: "Minimal documentation; unclear and disorganized",
                    8: "Basic documentation present; somewhat clear",
                    12: "Good documentation; includes user guide and code comments",
                    15: "Excellent documentation; comprehensive guides; professional presentation; articulate communication"
                }
            },
            {
                name: "Digital Citizenship, Ethics & Responsibility (NZQA)",
                description: "Demonstrates ethical technology use: data privacy/security, accessibility, sustainability, appropriate attribution, and consideration of broader social impacts.",
                points: 15,
                levels: {
                    0: "No ethical consideration; significant ethical concerns",
                    5: "Minimal ethics awareness; privacy/security not considered",
                    8: "Basic ethical awareness; some security and accessibility measures",
                    12: "Good ethical practices; privacy protection; accessibility; proper attribution",
                    15: "Exemplary ethical standards; privacy-first design; excellent accessibility; sustainable approach; social responsibility"
                }
            }
        ]
    }
};

/**
 * Helper function to create a rubric from preset
 */
function createRubricFromPreset(presetKey) {
    const preset = NZQA_RUBRICS[presetKey];
    if (!preset) {
        console.error('Rubric preset not found:', presetKey);
        return null;
    }

    return {
        title: preset.title,
        description: preset.description,
        total_points: preset.total_points,
        criteria: preset.criteria.map((criterion, index) => ({
            name: criterion.name,
            description: criterion.description,
            points: criterion.points,
            order: index,
            levels: criterion.levels
        }))
    };
}

/**
 * Get all available rubric presets
 */
function getAvailableRubrics() {
    return Object.keys(NZQA_RUBRICS).map(key => ({
        key: key,
        title: NZQA_RUBRICS[key].title,
        description: NZQA_RUBRICS[key].description,
        total_points: NZQA_RUBRICS[key].total_points,
        criteria_count: NZQA_RUBRICS[key].criteria.length
    }));
}

/**
 * Format points for display with level descriptions
 */
function getPointLevelDescription(criterion, points) {
    if (!criterion.levels || !criterion.levels[points]) {
        return null;
    }
    return criterion.levels[points];
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NZQA_RUBRICS, createRubricFromPreset, getAvailableRubrics, getPointLevelDescription };
}
