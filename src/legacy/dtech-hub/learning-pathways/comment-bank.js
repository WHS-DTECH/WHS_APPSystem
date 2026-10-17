// Reporting Comment Bank: shared by the Admin page, the Progression Pathway narrative builder and the server.
(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.commentBank = api;
})(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const disciplines = [["dtech", "DTECH"], ["textiles", "Textiles"], ["food", "Food"], ["wood", "Wood"], ["dvc", "DVC"]];
    // Order here is the order of the sentences in the narrative.
    const categories = [
        ["context", "Learning Context", "What the student has been learning."],
        ["strengths", "Learning Strengths", "What the student can demonstrate."],
        ["behaviours", "Learning Behaviours", "How the student approaches learning."],
        ["next", "Next Learning Steps", "What the student should work on next (goes in the Next learning steps box)."]
    ];
    const levels = [["any", "All levels"], ["beginning", "Beginning"], ["developing", "Developing"], ["confident", "Confident"], ["extending", "Extending"]];
    const pronouns = [["name", "First name each time"], ["she", "She / her"], ["he", "He / his"]];
    const limits = { comments: 3000, text: 500, subcategoryName: 80, subcategories: 40 };

    const categoryIds = categories.map(([id]) => id);
    const levelIds = levels.map(([id]) => id);
    const disciplineIds = disciplines.map(([id]) => id);
    const label = (list, id) => (list.find(([value]) => value === id) || [id, id])[1];

    // Starter bank: category -> subcategory -> level -> comments (in display order).
    // {name} is replaced by the student's name (or pronoun); {name}'s gives the possessive.
    const starter = {
        context: {
            "Digital Systems": { any: [
                "This term {name} has been exploring how computers represent, store and process information.",
                "{name} has been investigating how digital systems use inputs, processes and outputs to complete tasks.",
                "{name} has been learning how the hardware and software components of a computer work together.",
                "In Digital Systems, {name} has been examining how everyday devices collect, process and share information.",
                "{name} has been learning how binary is used to represent numbers, text, sound and images inside a computer.",
                "{name} has been building an understanding of how networks connect devices and move data between them."
            ] },
            "Data and Information": { any: [
                "{name} has been learning how different types of data are represented and stored in digital systems.",
                "This term {name} has been collecting, organising and presenting data to answer questions.",
                "{name} has been exploring how data can be encoded, for example by converting text and numbers into binary.",
                "{name} has been investigating how spreadsheets and databases are used to sort, filter and analyse information.",
                "{name} has been learning how to evaluate the accuracy and reliability of information found online.",
                "{name} has been exploring how charts, graphs and other visualisations help people understand data."
            ] },
            "Digital Citizenship": { any: [
                "{name} has been exploring what it means to participate safely and responsibly in digital environments.",
                "This term {name} has been learning how to manage digital information and protect personal privacy online.",
                "{name} has been investigating how online decisions can affect individuals, whānau and communities.",
                "{name} has been developing an understanding of ethical and respectful technology use.",
                "{name} has been learning about digital footprints and how online content can last over time.",
                "{name} has been exploring copyright, Creative Commons and how to acknowledge the work of others."
            ] },
            "Programming and Algorithms": { any: [
                "{name} has been learning to follow and construct step-by-step algorithms to solve problems.",
                "This term {name} has been developing programming skills through structured coding activities.",
                "{name} has been exploring how sequence, selection and repetition are used to control a program.",
                "{name} has been creating programs that respond to user input and events.",
                "{name} has been investigating how algorithms can be improved through testing and debugging.",
                "{name} has been using block-based and text-based coding environments to bring ideas to life."
            ] },
            "Systems and Control": { any: [
                "{name} has been exploring how physical and digital components work together in controlled systems.",
                "This term {name} has been investigating how sensors, inputs and outputs influence the behaviour of a system.",
                "{name} has been learning to construct and test simple electronic systems.",
                "{name} has been exploring how programming can control physical devices such as lights, motors and buzzers.",
                "{name} has been using microcontrollers to build systems that respond to their environment.",
                "{name} has been learning how feedback and control are used in everyday automated systems."
            ] },
            "Design and Digital Media": { any: [
                "{name} has been learning to create digital outcomes for a particular purpose and audience.",
                "This term {name} has been exploring how layout, colour and typography influence digital design.",
                "{name} has been developing skills in creating and editing digital media such as images, audio and video.",
                "{name} has been investigating how design conventions improve the usability of digital outcomes.",
                "{name} has been planning, creating and refining a digital outcome through an iterative design process."
            ] }
        },
        strengths: {
            "Knowledge and Understanding": {
                beginning: [
                    "{name} is beginning to recognise the key ideas introduced during lessons.",
                    "With support, {name} can describe some of the concepts explored in class.",
                    "{name} is starting to use some technical vocabulary when talking about their work."
                ],
                developing: [
                    "{name} demonstrates a growing understanding of the concepts explored in class.",
                    "{name} can explain familiar ideas using simple technical vocabulary.",
                    "{name} is beginning to connect practical activities with the ideas behind them."
                ],
                confident: [
                    "{name} demonstrates a sound understanding of the concepts covered this term.",
                    "{name} uses technical vocabulary accurately when explaining how digital systems work.",
                    "{name} can clearly explain the connections between practical tasks and the underlying concepts."
                ],
                extending: [
                    "{name} demonstrates an in-depth understanding of the concepts covered and applies them in new contexts.",
                    "{name} explains complex ideas clearly and accurately, using precise technical language.",
                    "{name} makes insightful connections between technology concepts and real-world applications."
                ]
            },
            "Practical Skills": {
                beginning: [
                    "{name} can complete familiar digital tasks when given clear, step-by-step instructions.",
                    "{name} is developing confidence in using the tools introduced during lessons.",
                    "{name} is beginning to apply newly learned skills in practical situations."
                ],
                developing: [
                    "{name} can apply familiar digital skills to complete structured activities.",
                    "{name} is becoming more confident when selecting appropriate digital tools.",
                    "{name} shows increasing accuracy when completing practical tasks."
                ],
                confident: [
                    "{name} applies practical skills accurately and with increasing independence.",
                    "{name} selects suitable tools and techniques for familiar tasks.",
                    "{name} produces carefully completed work that meets the stated requirements."
                ],
                extending: [
                    "{name} applies practical skills confidently in unfamiliar situations.",
                    "{name} works efficiently and accurately, often going beyond the task requirements.",
                    "{name} makes thoughtful decisions about the tools and techniques that best suit a task."
                ]
            },
            "Problem-Solving and Computational Thinking": {
                beginning: [
                    "{name} can identify some of the steps required to complete a digital task.",
                    "With guidance, {name} is beginning to break problems into smaller steps.",
                    "{name} is starting to recognise when something is not working as expected."
                ],
                developing: [
                    "{name} can use examples and demonstrations to support their problem-solving.",
                    "{name} is developing the ability to identify and correct simple errors.",
                    "{name} can follow and adapt simple algorithms to solve familiar problems."
                ],
                confident: [
                    "{name} uses logical approaches to solve practical digital problems.",
                    "{name} breaks problems into manageable parts and works through them systematically.",
                    "{name} tests solutions carefully and corrects errors independently."
                ],
                extending: [
                    "{name} demonstrates initiative when exploring alternative solutions to a problem.",
                    "{name} designs efficient solutions and can justify the decisions made.",
                    "{name} transfers knowledge from previous activities to solve new and complex challenges."
                ]
            },
            "Design and Creativity": {
                beginning: [
                    "{name} is beginning to share ideas about how a digital outcome could look or work.",
                    "With support, {name} can make simple design choices for a digital outcome.",
                    "{name} is starting to consider who will use the outcomes they create."
                ],
                developing: [
                    "{name} is developing ideas and making design choices with a purpose in mind.",
                    "{name} can make simple improvements to a design after testing or feedback.",
                    "{name} is beginning to consider the needs of the intended audience."
                ],
                confident: [
                    "{name} develops creative ideas that suit the purpose and audience.",
                    "{name} makes deliberate design choices about layout, colour and usability.",
                    "{name} refines designs in response to testing and feedback."
                ],
                extending: [
                    "{name} produces original, well-crafted outcomes that show strong design thinking.",
                    "{name} evaluates designs critically and makes thoughtful improvements.",
                    "{name} experiments confidently with new ideas to create innovative outcomes."
                ]
            },
            "Communication and Reflection": {
                beginning: [
                    "{name} is beginning to describe what they have made and how it works.",
                    "With prompting, {name} can identify what went well in a task."
                ],
                developing: [
                    "{name} can explain the steps taken to complete a digital activity.",
                    "{name} can identify what went well and what could be improved in their work."
                ],
                confident: [
                    "{name} clearly explains the process followed and the decisions made.",
                    "{name} reflects honestly on their progress and identifies ways to improve."
                ],
                extending: [
                    "{name} explains and justifies decisions with clarity and insight.",
                    "{name} reflects thoughtfully on their learning and sets meaningful goals."
                ]
            }
        },
        behaviours: {
            "Independence": {
                beginning: [
                    "{name} is developing confidence in working without continuous guidance.",
                    "{name} often relies on teacher support to begin tasks and is working towards greater independence."
                ],
                developing: [
                    "{name} completes familiar tasks independently once expectations are clear.",
                    "{name} is becoming more willing to attempt tasks before asking for help."
                ],
                confident: [
                    "{name} takes responsibility for organising and progressing through learning activities.",
                    "{name} works independently and makes good use of the resources available."
                ],
                extending: [
                    "{name} demonstrates initiative by selecting the next task or challenge without prompting.",
                    "{name} is a highly self-directed learner who manages their own learning with maturity."
                ]
            },
            "Persistence and Resilience": {
                beginning: [
                    "{name} is learning to persevere when digital tasks become challenging.",
                    "{name} is beginning to try again when a first attempt does not work."
                ],
                developing: [
                    "{name} is developing strategies for working through technical difficulties.",
                    "{name} shows increasing persistence when solving problems."
                ],
                confident: [
                    "{name} shows determination when working through unfamiliar problems.",
                    "{name} uses testing and feedback to keep improving their work."
                ],
                extending: [
                    "{name} demonstrates resilience and treats setbacks as opportunities to learn.",
                    "{name} approaches complex technical challenges with patience, persistence and a positive attitude."
                ]
            },
            "Focus and Organisation": {
                beginning: [
                    "{name} benefits from reminders to remain focused on the task.",
                    "{name} is developing more consistent work habits during practical lessons."
                ],
                developing: [
                    "{name} uses lesson time productively when provided with clear goals.",
                    "{name} is becoming more organised with digital files and resources."
                ],
                confident: [
                    "{name} maintains a consistent, focused approach to completing assigned activities.",
                    "{name} organises digital files and resources carefully and meets deadlines."
                ],
                extending: [
                    "{name} makes highly effective use of learning time and consistently produces quality work.",
                    "{name} plans and manages tasks efficiently, often completing extension work."
                ]
            },
            "Participation and Collaboration": {
                beginning: [
                    "{name} is becoming more comfortable contributing during class activities.",
                    "{name} is beginning to work with others during group tasks."
                ],
                developing: [
                    "{name} contributes ideas during class discussions and practical activities.",
                    "{name} works cooperatively with peers when given a clear role."
                ],
                confident: [
                    "{name} participates positively in lessons and works well with others.",
                    "{name} willingly shares ideas and listens respectfully to the views of others."
                ],
                extending: [
                    "{name} is a positive influence in the classroom and readily supports the learning of others.",
                    "{name} shows leadership in group work and shares knowledge generously with peers."
                ]
            },
            "Help-Seeking and Feedback": {
                beginning: [
                    "{name} is becoming more comfortable asking for assistance when needed.",
                    "{name} is learning to listen to feedback and act on it."
                ],
                developing: [
                    "{name} responds positively to guidance and teacher feedback.",
                    "{name} seeks clarification when instructions or expectations are unclear."
                ],
                confident: [
                    "{name} makes constructive use of feedback to improve their learning.",
                    "{name} asks thoughtful questions to deepen their understanding."
                ],
                extending: [
                    "{name} actively seeks feedback and uses it to refine and extend their work.",
                    "{name} asks insightful questions that extend the learning of the whole class."
                ]
            }
        },
        next: {
            "Knowledge and Understanding": {
                beginning: [
                    "{name}'s next step is to strengthen understanding of the key concepts introduced during lessons.",
                    "To progress, {name} should practise using key technical vocabulary when describing their work."
                ],
                developing: [
                    "{name}'s next step is to connect practical activities more clearly with the underlying concepts.",
                    "To progress, {name} should practise explaining how digital systems represent and process information."
                ],
                confident: [
                    "{name}'s next step is to apply existing knowledge to more challenging and unfamiliar situations.",
                    "To progress further, {name} should use precise technical vocabulary when explaining digital processes."
                ],
                extending: [
                    "{name}'s next step is to explore concepts beyond the year-level expectations and share this learning with others.",
                    "To keep extending, {name} should investigate how these concepts are applied in real-world technologies."
                ]
            },
            "Practical Skills": {
                beginning: [
                    "{name}'s next step is to practise using digital tools with greater independence.",
                    "To progress, {name} should follow instructions carefully to improve accuracy in practical tasks."
                ],
                developing: [
                    "{name}'s next step is to select appropriate tools and techniques without relying on demonstrations.",
                    "To progress, {name} should focus on accuracy and attention to detail in practical work."
                ],
                confident: [
                    "{name}'s next step is to develop more efficient approaches to completing digital tasks.",
                    "To progress further, {name} should extend practical skills through increasingly complex challenges."
                ],
                extending: [
                    "{name}'s next step is to apply advanced techniques to independent projects.",
                    "To keep extending, {name} should explore new tools and technologies beyond the class programme."
                ]
            },
            "Problem-Solving": {
                beginning: [
                    "{name}'s next step is to break unfamiliar problems into smaller, manageable steps.",
                    "To progress, {name} should try a strategy independently before asking for help."
                ],
                developing: [
                    "{name}'s next step is to develop confidence when identifying and correcting errors.",
                    "To progress, {name} should test solutions more systematically."
                ],
                confident: [
                    "{name}'s next step is to explain the reasoning behind chosen solutions.",
                    "To progress further, {name} should explore alternative approaches when an initial solution is unsuccessful."
                ],
                extending: [
                    "{name}'s next step is to evaluate and refine solutions to make them more efficient.",
                    "To keep extending, {name} should design solutions to open-ended problems using their own success criteria."
                ]
            },
            "Learning Habits": {
                beginning: [
                    "{name}'s next step is to maintain focus and make consistent progress during lessons.",
                    "To progress, {name} should ask for clarification promptly when difficulties arise."
                ],
                developing: [
                    "{name}'s next step is to complete activities more independently before requesting assistance.",
                    "To progress, {name} should use feedback to improve the quality of completed work."
                ],
                confident: [
                    "{name}'s next step is to take greater responsibility for managing learning tasks.",
                    "To progress further, {name} should set personal learning goals and reflect on progress towards them."
                ],
                extending: [
                    "{name}'s next step is to share expertise by supporting and mentoring peers.",
                    "To keep extending, {name} should take on leadership roles in collaborative projects."
                ]
            }
        }
    };

    function defaultBank() {
        const subcategories = {};
        const comments = [];
        let serial = 0;
        for (const category of categoryIds) {
            subcategories[category] = Object.keys(starter[category]);
            for (const [subcategory, byLevel] of Object.entries(starter[category])) {
                for (const level of levelIds) {
                    (byLevel[level] || []).forEach((text, index) => {
                        serial += 1;
                        comments.push({ id: `cb-${String(serial).padStart(3, "0")}`, discipline: "dtech", category, subcategory,
                            level, text, order: (index + 1) * 10, active: true });
                    });
                }
            }
        }
        return { subcategories, comments };
    }

    function newId() {
        return `cb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function validateBank(input) {
        if (!input || typeof input !== "object") throw new Error("A comment bank is required.");
        const subcategories = {};
        for (const category of categoryIds) {
            const names = input.subcategories?.[category];
            if (!Array.isArray(names) || names.length > limits.subcategories) throw new Error(`Invalid subcategories for ${label(categories, category)}.`);
            const seen = new Set();
            subcategories[category] = names.map((name) => {
                const clean = typeof name === "string" ? name.trim() : "";
                if (!clean || clean.length > limits.subcategoryName) throw new Error(`Subcategory names must be 1-${limits.subcategoryName} characters.`);
                if (seen.has(clean.toLowerCase())) throw new Error(`Duplicate subcategory "${clean}" in ${label(categories, category)}.`);
                seen.add(clean.toLowerCase());
                return clean;
            });
        }
        if (!Array.isArray(input.comments) || input.comments.length > limits.comments) throw new Error(`The bank can hold up to ${limits.comments} comments.`);
        const ids = new Set();
        const comments = input.comments.map((comment, index) => {
            if (!comment || typeof comment !== "object") throw new Error("Invalid comment.");
            const id = String(comment.id || "");
            if (!/^[a-z0-9-]{1,40}$/.test(id) || ids.has(id)) throw new Error("Comment IDs must be unique.");
            ids.add(id);
            if (!disciplineIds.includes(comment.discipline)) throw new Error(`Comment ${index + 1}: invalid discipline.`);
            if (!categoryIds.includes(comment.category)) throw new Error(`Comment ${index + 1}: invalid category.`);
            if (!subcategories[comment.category].includes(comment.subcategory)) throw new Error(`Comment ${index + 1}: subcategory "${comment.subcategory}" is not in ${label(categories, comment.category)}.`);
            if (!levelIds.includes(comment.level)) throw new Error(`Comment ${index + 1}: invalid development level.`);
            const text = typeof comment.text === "string" ? comment.text.trim().replace(/\s+/g, " ") : "";
            if (!text || text.length > limits.text) throw new Error(`Comment ${index + 1}: text must be 1-${limits.text} characters.`);
            if (!Number.isSafeInteger(comment.order) || comment.order < 0 || comment.order > 1e6) throw new Error(`Comment ${index + 1}: invalid display order.`);
            if (typeof comment.active !== "boolean") throw new Error(`Comment ${index + 1}: active must be true or false.`);
            return { id, discipline: comment.discipline, category: comment.category, subcategory: comment.subcategory,
                level: comment.level, text, order: comment.order, active: comment.active };
        });
        return { subcategories, comments };
    }

    // Discipline -> Category -> Subcategory -> Development Level -> Display Order.
    function sortComments(bank, comments = bank.comments) {
        const rank = (list, value) => { const index = list.indexOf(value); return index < 0 ? list.length : index; };
        return comments.slice().sort((a, b) => rank(disciplineIds, a.discipline) - rank(disciplineIds, b.discipline)
            || rank(categoryIds, a.category) - rank(categoryIds, b.category)
            || rank(bank.subcategories[a.category] || [], a.subcategory) - rank(bank.subcategories[b.category] || [], b.subcategory)
            || rank(levelIds, a.level) - rank(levelIds, b.level)
            || a.order - b.order || a.id.localeCompare(b.id));
    }

    // Renumbers a group's order values (10, 20, ...) after moves.
    function renumber(bank, comment) {
        sortComments(bank, bank.comments.filter((item) => item.discipline === comment.discipline && item.category === comment.category
            && item.subcategory === comment.subcategory && item.level === comment.level))
            .forEach((item, index) => { item.order = (index + 1) * 10; });
    }

    function firstName(fullName) {
        const name = String(fullName || "").trim();
        if (!name) return "";
        if (name.includes(",")) return name.split(",")[1].trim().split(/\s+/)[0] || name.split(",")[0].trim();
        return name.split(/\s+/)[0];
    }

    // The first {name} uses the student's name; later ones use the chosen pronoun (or the name again).
    function compose(texts, options = {}) {
        const name = String(options.name || "").trim() || "This student";
        const pronoun = options.pronoun === "she" || options.pronoun === "he" ? options.pronoun : "name";
        const possessive = { she: "her", he: "his" };
        let used = false;
        return texts.map((raw) => String(raw || "").trim()).filter(Boolean).map((text) => {
            let sentence = text.replace(/\{name\}('s)?/gi, (_match, owner, offset, whole) => {
                const atStart = offset === 0 || /[.!?]\s+$/.test(whole.slice(0, offset));
                let word;
                if (!used || pronoun === "name") {
                    word = owner ? `${name}${/s$/i.test(name) ? "'" : "'s"}` : name;
                    if (!atStart && name === "This student") word = word.replace(/^This/, "this");
                } else {
                    word = owner ? possessive[pronoun] : pronoun;
                    if (atStart) word = word[0].toUpperCase() + word.slice(1);
                }
                used = true;
                return word;
            });
            sentence = sentence[0].toUpperCase() + sentence.slice(1);
            return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
        }).join(" ");
    }

    const csvColumns = ["id", "discipline", "category", "subcategory", "level", "order", "active", "text"];
    function toCsv(bank) {
        const cell = (value) => { const text = String(value); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
        return [csvColumns.join(","), ...sortComments(bank).map((comment) => csvColumns.map((column) => cell(comment[column])).join(","))].join("\r\n") + "\r\n";
    }
    function parseCsv(text) {
        const rows = [];
        let row = [], field = "", quoted = false;
        const source = String(text || "").replace(/^\uFEFF/, "");
        for (let index = 0; index < source.length; index += 1) {
            const char = source[index];
            if (quoted) {
                if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
                else if (char === '"') quoted = false;
                else field += char;
            } else if (char === '"') quoted = true;
            else if (char === ",") { row.push(field); field = ""; }
            else if (char === "\n" || char === "\r") {
                if (char === "\r" && source[index + 1] === "\n") index += 1;
                row.push(field); rows.push(row); row = []; field = "";
            } else field += char;
        }
        if (field || row.length) { row.push(field); rows.push(row); }
        return rows.filter((cells) => cells.some((value) => value.trim()));
    }
    // Accepts ids or labels (e.g. "Learning Strengths", "Confident", "DTECH"); new subcategories are added in file order.
    function fromCsv(text) {
        const rows = parseCsv(text);
        if (!rows.length) throw new Error("The CSV file is empty.");
        const header = rows[0].map((value) => value.trim().toLowerCase());
        const at = (name) => header.indexOf(name);
        for (const column of ["discipline", "category", "subcategory", "level", "text"]) if (at(column) < 0) throw new Error(`The CSV needs a "${column}" column.`);
        const lookup = (list, value, what, line) => {
            const clean = String(value || "").trim().toLowerCase();
            const alias = { "next learning": "next" }[clean];
            const match = list.find(([id, name]) => id === clean || id === alias || name.toLowerCase() === clean);
            if (!match) throw new Error(`Row ${line}: unknown ${what} "${value}".`);
            return match[0];
        };
        const subcategories = Object.fromEntries(categoryIds.map((id) => [id, []]));
        const ids = new Set();
        const comments = rows.slice(1).map((cells, index) => {
            const line = index + 2;
            const get = (name) => (at(name) < 0 ? "" : String(cells[at(name)] ?? "").trim());
            const category = lookup(categories, get("category"), "category", line);
            const subcategory = get("subcategory");
            if (!subcategory) throw new Error(`Row ${line}: subcategory is required.`);
            const existing = subcategories[category].find((name) => name.toLowerCase() === subcategory.toLowerCase());
            if (!existing) subcategories[category].push(subcategory);
            let id = get("id").toLowerCase();
            if (!/^[a-z0-9-]{1,40}$/.test(id) || ids.has(id)) id = newId() + index;
            ids.add(id);
            const order = Number.parseInt(get("order"), 10);
            const active = get("active").toLowerCase();
            return { id, discipline: lookup(disciplines, get("discipline") || "dtech", "discipline", line), category,
                subcategory: existing || subcategory, level: lookup(levels, get("level") || "any", "level", line),
                order: Number.isSafeInteger(order) && order >= 0 ? order : (index + 1) * 10,
                active: !["false", "no", "0", "inactive"].includes(active), text: get("text") };
        });
        return validateBank({ subcategories, comments });
    }

    return { disciplines, categories, levels, pronouns, limits, label, defaultBank, validateBank, sortComments, renumber,
        newId, firstName, compose, toCsv, parseCsv, fromCsv };
});
