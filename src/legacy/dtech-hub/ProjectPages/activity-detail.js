const DETAIL_DATA = {
    "cyber-safety-lab": {
        title: "Cyber Safety Lab",
        yearLevel: "Year 9",
        type: "Cyber Security",
        duration: "2 hrs",
        term: "Term 2",
        summary: "Learn password hygiene, phishing detection, and practical online safety routines through mini challenges.",
        resources: ["Case-study cards", "Security checklist", "Reflection template"],
        equipment: ["Laptop or Chromebook", "Internet access", "Presentation display"],
        instructions: ["Review real phishing examples.", "Classify risky vs safe online actions.", "Create a personal security action plan."],
        image: "https://placehold.co/900x560/6f35a2/ffffff?text=Cyber+Safety+Lab"
    },
    "data-visual-story": {
        title: "Data Visual Story",
        yearLevel: "Year 12",
        type: "Data Skills",
        duration: "2 hrs",
        term: "Term 2",
        summary: "Convert class data into clear visual dashboards and short evidence-based stories for assessment.",
        resources: ["Dataset CSV", "Storyboard worksheet", "Assessment rubric"],
        equipment: ["Spreadsheet tool", "Charting app", "Projector"],
        instructions: ["Clean and group the dataset.", "Create two chart options.", "Write a short data story and peer-review."],
        image: "https://placehold.co/900x560/3f9e70/ffffff?text=Data+Visual+Story"
    },
    "digital-portfolio-studio": {
        title: "Digital Portfolio Studio",
        yearLevel: "Year 11",
        type: "Digital Learning",
        duration: "2 hrs",
        term: "Term 1",
        summary: "Archive and polish published reflections, checkpoints, and final showcase evidence from prior units.",
        resources: ["Portfolio checklist", "Evidence tracker", "Reflection prompts"],
        equipment: ["Laptop", "Portfolio platform", "Cloud storage"],
        instructions: ["Audit current portfolio pages.", "Upload missing evidence.", "Improve reflection quality and structure."],
        image: "https://placehold.co/900x560/6a58b5/ffffff?text=Digital+Portfolio+Studio"
    },
    "maker-lab-builds": {
        title: "Maker Lab Builds",
        yearLevel: "Year 13",
        type: "STEM Projects",
        duration: "2 hrs",
        term: "Term 1",
        summary: "Archive prototypes, sprint notes, and build logs from fabrication and automation challenges.",
        resources: ["Design journal", "Build checklist", "Testing log template"],
        equipment: ["Prototype materials", "Workshop tools", "Safety gear"],
        instructions: ["Review latest prototype version.", "Record test outcomes.", "Plan and document next iteration."],
        image: "https://placehold.co/900x560/676c86/ffffff?text=Maker+Lab+Builds"
    },
    "python-debug-lab": {
        title: "Python Debug Lab",
        yearLevel: "Year 11",
        type: "Programming",
        duration: "2 hrs",
        term: "Term 2",
        summary: "Track down logic bugs, run tests, and improve code quality with guided debugging missions.",
        resources: ["Bug scenario sheets", "Test cases", "Reflection form"],
        equipment: ["Python IDE", "Terminal", "Version control workspace"],
        instructions: ["Run failing script and inspect errors.", "Apply debugging strategy step-by-step.", "Commit fixed version with notes."],
        image: "https://placehold.co/900x560/b15186/ffffff?text=Python+Debug+Lab"
    },
    "robotics-control-board": {
        title: "Robotics Control Board",
        yearLevel: "Year 12",
        type: "Physical Computing",
        duration: "2 hrs",
        term: "Term 2",
        summary: "Build and monitor microcontroller projects, capture test data, and document each hardware iteration.",
        resources: ["Circuit plan", "Sensor worksheet", "Data capture table"],
        equipment: ["Microcontroller kit", "Breadboard and wires", "Laptop with serial monitor"],
        instructions: ["Assemble control-board layout.", "Upload and test baseline program.", "Tune behavior and document outcomes."],
        image: "https://placehold.co/900x560/2f95b2/ffffff?text=Robotics+Control+Board"
    },
    "web-ui-remix": {
        title: "Web UI Remix",
        yearLevel: "Year 10",
        type: "Web Design",
        duration: "2 hrs",
        term: "Term 2",
        summary: "Re-style an existing page with stronger visual hierarchy, accessibility checks, and responsive layout improvements.",
        resources: ["UI checklist", "Wireframe sketch sheet", "Accessibility notes"],
        equipment: ["Code editor", "Browser devtools", "Reference design board"],
        instructions: ["Audit current layout issues.", "Apply typography and spacing updates.", "Validate responsiveness and accessibility."],
        image: "https://placehold.co/900x560/b67a3c/ffffff?text=Web+UI+Remix"
    }
};

const DETAIL_HUB_AUTH_STORAGE_KEY = "hub_google_auth_v1";
const TRELLO_CARD_LINK_STORAGE_PREFIX = "hub_trello_card_link_v1";
const TRELLO_CARD_LIBRARY_STORAGE_PREFIX = "hub_trello_card_library_v1";
const GITHUB_REPO_LIBRARY_STORAGE_PREFIX = "hub_github_repo_library_v1";
const ONEDRIVE_LINK_LIBRARY_STORAGE_PREFIX = "hub_onedrive_link_library_v1";
const HTML_FILE_LINK_LIBRARY_STORAGE_PREFIX = "hub_html_file_link_library_v1";
const CSS_FILE_LINK_LIBRARY_STORAGE_PREFIX = "hub_css_file_link_library_v1";
const GOOGLE_DRIVE_LINK_LIBRARY_STORAGE_PREFIX = "hub_google_drive_link_library_v1";
const GOOGLE_FORM_LINK_LIBRARY_STORAGE_PREFIX = "hub_google_form_link_library_v1";
const TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX = "hub_task_topic_slide_sync_v1";
const TESTING_FUNCTIONS_LIST_COUNT_STORAGE_PREFIX = "hub_testing_functions_list_counts_v1";
const DIGIMED_CONVENTIONS_ACK_STORAGE_PREFIX = "hub_digimed_conventions_ack_v1";
const DIGIMED_CONVENTION_AREAS = ["Navigation", "Layout", "Typography", "Links", "Buttons/Controls", "Forms", "Visual hierarchy", "Images/Media", "Consistency", "Responsive design", "Feedback", "Content organisation"];
const DIGIMED_IMAGE_CONVENTIONS_ACK_STORAGE_PREFIX = "hub_digimed_image_conventions_ack_v1";
const DIGIMED_IMAGE_CONVENTION_CHECKS = [
    ["Composition & Layout", "Are elements deliberately positioned and arranged? Is the composition balanced and appropriate for the purpose?"],
    ["Visual Hierarchy", "Is it clear what the viewer should notice first, second and next? Are size, position, contrast and emphasis used deliberately?"],
    ["Alignment & Proximity", "Are related elements visually grouped? Are elements aligned consistently rather than appearing randomly positioned?"],
    ["Colour", "Is the colour palette appropriate for the purpose, audience and intended mood? Is colour used consistently and with sufficient contrast?"],
    ["Typography", "Are fonts, sizes, weights, spacing and text placement appropriate, readable and consistent?"],
    ["Contrast", "Is sufficient difference created between important elements, text and backgrounds so information can be distinguished clearly?"],
    ["Consistency", "Are repeated colours, fonts, styles, shapes, spacing and visual treatments used consistently across the outcome or series?"],
    ["Image Quality & Resolution", "Are images appropriately sharp, correctly sized and of sufficient resolution for their intended screen or print output?"],
    ["Cropping & Framing", "Are images cropped deliberately? Does framing support the subject and purpose without accidentally removing important information?"],
    ["Scale & Proportion", "Are elements appropriately sized in relation to one another? Is scale deliberately used to establish importance or emphasis?"],
    ["Whitespace / Negative Space", "Is empty space used deliberately to separate, organise and emphasise content rather than filling every available area?"],
    ["Legibility & Readability", "Can textual information be read easily at the intended viewing size and distance?"],
    ["Appropriate File Format", "Is the image saved or exported in a format appropriate to its intended use, such as PNG, JPEG, SVG or another suitable format?"],
    ["Purpose & Audience Appropriateness", "Do the visual style, imagery, language and presentation suit the intended purpose and users or viewers?"]
];
const DIGIMED_UX_PRINCIPLES_ACK_STORAGE_PREFIX = "hub_digimed_ux_principles_ack_v1";
const DIGIMED_UX_PRINCIPLE_AREAS = ["Visibility of system status", "Match between system and the real world", "User control and freedom", "Consistency and standards", "Error prevention", "Recognition rather than recall", "Flexibility and efficiency of use", "Aesthetic and minimalist design", "Help users recognise and recover from errors", "Accessibility"];
const DIGIMED_VIDEO_INTEGRITY_ACK_STORAGE_PREFIX = "hub_digimed_video_integrity_ack_v1";
const DIGIMED_VIDEO_INTEGRITY_CHECKS = ["Resolution", "Aspect ratio", "Frame rate", "Audio levels/quality", "Missing/offline media", "Export format/codec", "Playback testing", "Titles/credits/text accuracy", "Media/source accuracy", "Final file integrity"];
const DIGIMED_IMAGE_INTEGRITY_ACK_STORAGE_PREFIX = "hub_digimed_image_integrity_ack_v1";
const DIGIMED_IMAGE_INTEGRITY_CHECKS = [
    ["Document Setup Check", "Correct dimensions, orientation, resolution, colour mode and artboard/canvas setup for the intended output"],
    ["Image Resolution & Quality Check", "Placed/raster images have sufficient resolution and are not unintentionally pixelated, stretched or distorted"],
    ["Linked / Embedded Asset Check", "Illustrator links and Photoshop linked/Smart Objects are available, current and correctly referenced; no missing assets"],
    ["Colour Mode & Colour Check", "Appropriate RGB/CMYK mode, consistent colour use, and colours reproduce appropriately for the intended screen/print output"],
    ["Typography & Font Check", "Fonts are available, text displays correctly, spelling/content is accurate and there are no missing/substituted fonts"],
    ["Layer / Object Integrity Check", "Required layers, masks, objects and effects are present and working; no accidental hidden/locked objects or unwanted content"],
    ["Transparency / Effects Check", "Masks, blending modes, opacity, clipping masks, effects and transparency render as intended"],
    ["Crop / Bleed / Safe Area Check", "Important content is not accidentally cropped; bleed and safe margins are correct where required for print"],
    ["File Format / Export Validation", "PNG, JPEG, PDF, SVG etc. is appropriate for purpose and export settings preserve required quality/transparency"],
    ["Final Output Check", "Exported outcome is opened independently and checked at its intended size/device/medium to confirm it displays or prints as intended"]
];
const DIGIMED_VIDEO_UX_ACK_STORAGE_PREFIX = "hub_digimed_video_ux_ack_v1";
const DIGIMED_VIDEO_CONVENTIONS_ACK_STORAGE_PREFIX = "hub_digimed_video_conventions_ack_v1";
const DIGIMED_VIDEO_UX_CHECKS = [
    ["Clarity", "Can viewers understand what is happening?"],
    ["Pacing", "Does the content move at an appropriate rate?"],
    ["Visual hierarchy/attention", "Does the viewer know where to look?"],
    ["Consistency", "Are titles, graphics, audio and visual treatment coherent?"],
    ["Accessibility", "Captions/subtitles, readable text, sufficient contrast, and not relying solely on audio where inappropriate."],
    ["Cognitive load", "Is too much information presented simultaneously?"],
    ["Audio intelligibility", "Can users clearly hear speech and important information?"],
    ["Feedback/orientation", "For instructional video, does the viewer understand where they are in the sequence?"],
    ["End-user control", "Where relevant, chapters/timestamps/platform controls."]
];
const DIGIMED_VIDEO_CONVENTION_CHECKS = [
    ["Shot composition", "Framing, rule of thirds, headroom, lead room"],
    ["Shot selection", "Wide/establishing, medium, close-up, cutaway"],
    ["Continuity", "Continuity editing, match on action, 180-degree rule"],
    ["Transitions", "Cuts, fades, dissolves used appropriately"],
    ["Pacing", "Shot duration and editing rhythm appropriate to purpose"],
    ["Titles/text", "Readable, consistent titles/captions/lower thirds"],
    ["Audio", "Clear dialogue intelligibility, music balance, appropriate sound"],
    ["Visual hierarchy", "Directing viewer attention"],
    ["Credits", "Appropriate opening/end titles and attribution"],
    ["Narrative structure", "Beginning/development/conclusion where appropriate"],
    ["Genre conventions", "Conventions appropriate to documentary, tutorial, advertisement, narrative film, etc."]
];
const DIGIMED_VIDEO_PRODUCTION_PROGRESS_STORAGE_PREFIX = "hub_digimed_video_production_progress_v1";
const DIGIMED_VIDEO_PRODUCTION_PROGRESS = {
    "Pre-production": ["Storyboard", "Shot list", "Asset planning"],
    "Production": ["Footage captured", "Audio captured", "Original assets created"],
    "Post-production": ["Rough cut", "Fine cut", "Audio mix", "Colour correction/grading", "Titles/graphics", "Captions", "Final export"]
};
const DIGIMED_WEB_PRODUCTION_PROGRESS_STORAGE_PREFIX = "hub_digimed_web_production_progress_v1";
const DIGIMED_WEB_PRODUCTION_PROGRESS = {
    "Pre-production / Planning": ["Digital outcome and purpose defined", "MUST-DOs identified", "End-user requirements identified", "Sitemap / site structure planned", "Wireframes / page layouts developed", "Asset requirements identified", "Tools & techniques identified", "Relevant implications considered"],
    "Development": ["Folder/file structure established", "HTML structure developed", "Navigation developed", "CSS styling developed", "Media/assets integrated", "Responsive layout developed", "Interactive functionality developed", "Advanced/complex techniques implemented", "Components trialled and refined", "GitHub/version control used throughout"],
    "Testing & Refinement": ["MUST-DO/functionality testing", "HTML validation", "CSS validation", "Links/navigation tested", "Responsive/device testing", "End-user testing", "Accessibility checks", "Asset optimisation", "Testing/trialling information acted upon", "Changes retested"],
    "Final Production": ["Final content checked", "Unused/duplicate assets removed", "Final HTML/CSS validation", "Final functionality test", "Final responsive/device check", "Final asset optimisation", "Final version committed", "Final outcome published/deployed"]
};
const EVIDENCE_STEPS_TARGET_STANDARDS = new Set(["92005", "91897", "91907"]);

const DIGITAL_OUTCOME_DETAILS_TASKS = [
    "Description - Google Slides: Describe the Digital Outcome: What is it, who is it for, and what should it do?",
    "Identify the target audience or end user for this outcome.",
    "Explain how the outcome will be developed and what tools/technologies will be used.",
    "State how success will be measured or evaluated."
];

const DIGITAL_OUTCOME_DESCRIPTION_TITLE = "Digital Outcome Description";
const DIGITAL_OUTCOME_TARGET_AUDIENCE_TITLE = "Target Audience";
const DIGITAL_OUTCOME_DEVELOPMENT_TOOLS_TITLE = "Development Steps";
const DIGITAL_OUTCOME_TRIALLING_COMPONENTS_TITLE = "Trialling Components";
const DIGITAL_OUTCOME_TOOLS_TECHNIQUES_TITLE = "Tools & Techniques";
const USE_OF_TOOLS_TECHNIQUES_TITLE = "Using Tools & Techniques";
const USE_OF_TOOLS_TECHNIQUES_TEMPLATE_TITLE = "Use of Tools & Techniques";
const USE_OF_TOOLS_TECHNIQUES_EVIDENCE_STANDARD = "digimed-tools-techniques";
const USE_OF_TOOLS_TECHNIQUES_LABELS_91893 = [
    "Creating or customising scripts, code or presets",
    "Using a combination of steps to manipulate or enhance elements",
    "Using a third-party library",
    "Using composite effects"
];
const USE_OF_TOOLS_TECHNIQUES_LABELS_91903 = [
    "Non-core functionality",
    "Sophisticated digital effects",
    "Applying industry standards or guidelines",
    "Responsive design for use on multiple devices",
    "Integration of original media assets",
    "Dynamic data handling and interactivity",
    "Automation through scripts"
];
const DIGITAL_OUTCOME_TESTING_FUNCTIONS_TITLE = "Testing Functions";
const DIGITAL_OUTCOME_RELEVANT_DIGIMED_CONVENTIONS_TITLE = "Conventions (WEB)";
const DIGITAL_OUTCOME_UX_PRINCIPLES_TITLE = "UX Principles (Web)";
const DIGITAL_OUTCOME_VIDEO_INTEGRITY_TITLE = "Integrity & Validation (VIDEO)";
const DIGITAL_OUTCOME_IMAGE_INTEGRITY_TITLE = "Integrity & Validation (IMAGE)";
const DIGITAL_OUTCOME_VIDEO_UX_PRINCIPLES_TITLE = "UX Principles (Video)";
const DIGITAL_OUTCOME_VIDEO_CONVENTIONS_TITLE = "Conventions (VIDEO)";
const DIGITAL_OUTCOME_SUCCESS_CRITERIA_TITLE = "Success Criteria";
const DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_TITLE = "Relevant Implications";
const DIGITAL_OUTCOME_CODE_VALIDATION_TITLE = "Integrity & Validation (WEB)";
// The synced template library lists this task's slides under "Markup Validation", not "Code Validation".
const DIGITAL_OUTCOME_CODE_VALIDATION_TEMPLATE_SEARCH_TITLE = "Markup Validation";
const DIGITAL_OUTCOME_DESCRIPTION_TEMPLATE_PREVIEW_URL = "https://drive.google.com/thumbnail?id=1brOY70u9aJdsoiEtxVepr82vRhiv9VzpMm8TUv3lcTo&sz=w1400";
const DIGITAL_OUTCOME_TOOLS_TECHNIQUES_TEMPLATE_PREVIEW_URL = "https://drive.google.com/thumbnail?id=1f3Ff0KG2JCFQ-x41q6TEK15Yjcx8imjRCGUZ6d254wg&sz=w1400";
const DIGITAL_OUTCOME_TARGET_AUDIENCE_TEMPLATE_PREVIEW_URL = "../images/target-audience-template-preview.svg";
const DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_FULL_SET_URL = "https://docs.google.com/presentation/d/1l2bRgY8o4FnVstB3QGq4sh4Yg5IRRijH4EmtHtwvP2Q/edit?usp=sharing";
const DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_TEMPLATE_PREVIEW_URL = "https://drive.google.com/thumbnail?id=1l2bRgY8o4FnVstB3QGq4sh4Yg5IRRijH4EmtHtwvP2Q&sz=w1400";
const DIGITAL_OUTCOME_GENERIC_TEMPLATE_PREVIEW_URL = "../images/template-preview-placeholder.svg";

const EVIDENCE_STEPS_DEFAULTS = {
    "92005": [
        "Define what the digital outcome needs to do.",
        "Collect and review evidence of user or stakeholder needs.",
        "Build and test versions of the outcome.",
        "Record changes and justify decisions using evidence.",
        "Evaluate the final outcome against requirements."
    ],
    "91897": [
        "Achieved: Use appropriate project management tools and techniques to plan the development of a digital technologies outcome.",
        "Achieved: Decompose the outcome into smaller components.",
        "Achieved: List the key features or requirements the outcome must include.",
        "Achieved: Trial the components of the digital technologies outcome.",
        "Achieved: Test that the digital technologies outcome functions as intended.",
        "Achieved: Explain relevant implications.",
        "Merit: Effectively use project management and version control tools and techniques to manage development of a digital technologies outcome.",
        "Merit: Trial multiple components and/or techniques and select those that are most suitable.",
        "Merit: Use information from testing and trialling to improve the functionality of the digital technologies outcome.",
        "Merit: Address relevant implications.",
        "Excellence: Discuss how planning, testing, and trialling information assisted the development of a high-quality outcome."
    ],
    "91907": [
        "Achieved: Use recognised and appropriate project management techniques to plan the development of a digital technologies outcome.",
        "Achieved: Decompose the digital technologies outcome into smaller components.",
        "Achieved: Trial components of the outcome.",
        "Achieved: Test that the digital technologies outcome functions as intended.",
        "Achieved: Address relevant implications.",
        "Merit: Effectively use project management techniques to manage development, feedback and/or collaborative processes.",
        "Merit: Effectively trial multiple components and/or techniques.",
        "Merit: Effectively use information from testing and trialling to improve the functionality of the digital technologies outcome.",
        "Excellence: Synthesise information gained from the planning, testing and trialling of components.",
        "Excellence: Discuss how this information led to the development of a high-quality digital technologies outcome."
    ]
};

const SUGGESTED_TOOLS_BY_CONTEXT = {
    "programming": ["Python", "JavaScript", "HTML/CSS", "Java", "C#", "GitHub", "VS Code", "Git", "SQL", "React"],
    "web": ["HTML", "CSS", "JavaScript", "React", "Vue.js", "Figma", "GitHub", "npm", "Visual Studio Code", "Bootstrap"],
    "design": ["Figma", "Adobe Photoshop", "Adobe Illustrator", "Canva", "Sketch", "Adobe XD", "Protopie", "InVision", "Pen and Paper", "Wireframing Tools"],
    "digital-media": ["Adobe Premiere Pro", "Adobe After Effects", "DaVinci Resolve", "Final Cut Pro", "Adobe Audition", "Blender", "OBS Studio", "Figma", "Adobe Photoshop", "Audacity"],
    "image": ["Adobe Photoshop", "Adobe Illustrator", "Canva", "Figma", "GIMP", "Lightroom", "Photopea", "Adobe Express", "Google Drive", "GitHub"],
    "video": ["DaVinci Resolve", "Adobe Premiere Pro", "Adobe After Effects", "Final Cut Pro", "CapCut", "OBS Studio", "Audacity", "Canva", "Google Drive", "GitHub"],
    "audio": ["Audacity", "Adobe Audition", "GarageBand", "BandLab", "Soundtrap", "OBS Studio", "DaVinci Resolve", "Google Drive", "GitHub", "Trello"],
    "data": ["Excel", "Google Sheets", "Python (Pandas)", "Power BI", "Tableau", "SQL", "Google Data Studio", "R", "Jupyter Notebook", "CSV"],
    "general": ["Google Workspace", "Microsoft Office", "Trello", "GitHub", "Google Drive", "OneDrive", "Slack", "Zoom", "Figma", "Notion"]
};

const DIGITAL_MEDIA_91903_GUIDANCE = {
    "web": {
        heading: "Tools & Techniques - 91903 Web-based Outcome",
        examplesHeading: "Web-based examples students could identify",
        rows: [
            ["Non-core functionality", "Search/filter systems, form processing and validation, user authentication, local/session storage, API integration, database interaction"],
            ["Sophisticated digital effects", "CSS animations, transitions, transforms, interactive visual effects, JavaScript-driven effects, animated interface elements"],
            ["Applying industry standards or guidelines", "Semantic HTML, accessibility/WCAG practices, HTML/CSS standards, appropriate web conventions, web performance practices"],
            ["Responsive design for use on multiple devices", "Media queries, CSS Grid/Flexbox, responsive navigation, fluid layouts, responsive images, relative units and breakpoints"],
            ["Integration of original media assets", "Original photography, graphics, icons, illustrations, animation, video or audio created/edited by the student and incorporated into the website"],
            ["Dynamic data handling and interactivity", "DOM manipulation, dynamic filtering/searching, interactive forms, dynamically generated content, fetching/displaying data, storing/retrieving data"],
            ["Automation through scripts", "JavaScript automation, automated generation/manipulation of content, scripts for repetitive processes, build/processing scripts where appropriate"]
        ]
    },
    "video": {
        heading: "Tools & Techniques - 91903 Video/Film Outcome",
        examplesHeading: "Video/Film examples students could identify",
        rows: [
            ["Non-core functionality", "Advanced editing features, motion tracking, keyframing, multicam editing"],
            ["Sophisticated digital effects", "Compositing, masking, chroma key, colour grading, motion graphics, visual effects"],
            ["Applying industry standards or guidelines", "Frame rate, resolution, aspect ratio, safe audio levels, codecs/export standards"],
            ["Responsive design for use on multiple devices", "Usually not relevant to a conventional video outcome"],
            ["Integration of original media assets", "Original footage, voice-over, photography, graphics, animation, recorded audio"],
            ["Dynamic data handling and interactivity", "Usually not relevant unless producing interactive video/media"],
            ["Automation through scripts", "Batch processing, automated workflows, expressions/scripts where appropriate"]
        ]
    },
    "image": {
        heading: "Tools & Techniques - 91903 Image Outcome",
        examplesHeading: "Image examples students could identify",
        rows: [
            ["Non-core functionality", "Non-destructive editing, layer masks, adjustment layers, smart objects"],
            ["Sophisticated digital effects", "Advanced compositing, retouching, colour grading, vector effects, photo manipulation"],
            ["Applying industry standards or guidelines", "Resolution, colour profiles, file formats, print/web export standards, copyright attribution"],
            ["Responsive design for use on multiple devices", "Exporting appropriate image sizes and formats for different display contexts"],
            ["Integration of original media assets", "Original photography, illustrations, icons, textures, typography or scanned work"],
            ["Dynamic data handling and interactivity", "Usually not relevant unless producing an interactive image-based outcome"],
            ["Automation through scripts", "Batch export, actions, presets, automated resizing or processing workflows"]
        ]
    },
    "audio": {
        heading: "Tools & Techniques - 91903 Audio Outcome",
        examplesHeading: "Audio examples students could identify",
        rows: [
            ["Non-core functionality", "Multi-track editing, automation, MIDI sequencing, podcast production workflows"],
            ["Sophisticated digital effects", "Equalisation, compression, reverb, noise reduction, mixing and mastering effects"],
            ["Applying industry standards or guidelines", "Sample rate, bit depth, loudness levels, file formats, copyright and attribution"],
            ["Responsive design for use on multiple devices", "Exporting accessible audio formats and appropriate playback compatibility"],
            ["Integration of original media assets", "Original recordings, voice-over, sound effects, music, interviews or field audio"],
            ["Dynamic data handling and interactivity", "Usually not relevant unless producing interactive audio media"],
            ["Automation through scripts", "Batch processing, automated fades/levels, presets and repeatable export workflows"]
        ]
    },
    "mixed": {
        heading: "Tools & Techniques - 91903 Digital Media Outcome",
        examplesHeading: "Digital Media examples students could identify",
        rows: [
            ["Non-core functionality", "Advanced functions appropriate to the chosen media combination"],
            ["Sophisticated digital effects", "Compositing, animation, audio effects or interactive media effects"],
            ["Applying industry standards or guidelines", "Appropriate technical, accessibility, export and copyright standards"],
            ["Responsive design for use on multiple devices", "Adaptation for the devices and contexts where the outcome will be used"],
            ["Integration of original media assets", "Original media created and combined by the student"],
            ["Dynamic data handling and interactivity", "Interactive elements or dynamic content where appropriate"],
            ["Automation through scripts", "Automated workflows, scripts, presets or batch processing where appropriate"]
        ]
    }
};

const DIGITAL_MEDIA_91893_GUIDANCE = {
    "web": {
        heading: "Tools & Techniques - 91893 Web-based Outcome",
        examplesHeading: "Web-based examples students could identify",
        rows: [
            ["Creating or customising scripts, code or presets", "Creating/customising JavaScript, CSS animations, reusable code, templates or configuration/preset files"],
            ["Using a combination of steps to manipulate or enhance elements", "Editing/optimising images, combining CSS properties/effects, manipulating media assets, or using multiple processes to prepare assets for the website"],
            ["Using a third-party library", "Using and appropriately integrating a JavaScript/CSS library, framework, icon library or other external code resource"],
            ["Using composite effects", "Combining layers, transparency, gradients, filters, masks, blending, animation or multiple CSS/media effects to produce a composed visual result"]
        ]
    },
    "video": {
        heading: "Tools & Techniques - 91893 Video/Film Outcome",
        examplesHeading: "Video/Film examples students could identify",
        rows: [
            ["Creating or customising scripts, code or presets", "Creating/customising title templates, transition presets, colour-grading presets, motion-graphics templates, animation presets, effect settings, or reusable editing presets"],
            ["Using a combination of steps to manipulate or enhance elements", "Colour correction and grading, audio enhancement, speed adjustment, masking, keyframing, stabilisation, layering effects, removing backgrounds, or combining multiple editing processes to improve footage"],
            ["Using a third-party library", "Using an appropriate external library of sound effects, music, fonts, graphics, LUTs, transitions, effects, stock footage, or other media resources within licensing requirements"],
            ["Using composite effects", "Combining multiple video, image, text, graphic or effect layers; green-screen/chroma key; masking; overlays; blending; picture-in-picture; motion graphics; or combining visual effects to create the final composition"]
        ]
    },
    "image": {
        heading: "Tools & Techniques - 91893 Image Outcome",
        categoryHeading: "Tool / Technique",
        examplesHeading: "Examples in Photoshop / Illustrator",
        rows: [
            ["Layers & Layer Organisation", "Layers, groups, naming, ordering, locking and organising complex artwork"],
            ["Selection Techniques", "Object Selection, Quick Selection, Select Subject, Pen Tool, paths, selecting by colour or properties"],
            ["Masks & Clipping", "Layer masks, clipping masks, vector masks, opacity masks; isolating or combining imagery non-destructively"],
            ["Adjustment & Colour Techniques", "Adjustment layers, Levels, Curves, Hue/Saturation, colour balance, recolouring artwork, gradients and swatches"],
            ["Blending & Transparency", "Blending modes, opacity, transparency, blend options and combining elements"],
            ["Vector Drawing & Shape Construction", "Pen Tool, Bezier paths, Shape Builder, Pathfinder, compound paths and custom vector shapes"],
            ["Typography Techniques", "Character/paragraph controls, text styles, text on paths, kerning/tracking/leading and typographic hierarchy"],
            ["Transform & Manipulation", "Scale, rotate, distort, warp, perspective, Puppet Warp, Free Transform and Illustrator transformation tools"],
            ["Retouching & Image Correction", "Healing, Clone Stamp, Content-Aware tools, removal/replacement, sharpening and image correction"],
            ["Filters & Effects", "Smart Filters, blur/sharpen effects, Illustrator appearances, shadows, glows, distortions and other purposeful effects"],
            ["Smart Objects / Linked Assets", "Smart Objects, linked Smart Objects, placed Illustrator/Photoshop assets and updating linked artwork"],
            ["Reusable Styles & Assets", "Graphic styles, layer styles, swatches, brushes, symbols, libraries, presets and reusable components"],
            ["Composition & Layout Tools", "Artboards, guides, grids, alignment/distribution tools, rulers and snapping"],
            ["Image Compositing", "Combining photographs, vectors, text, masks, effects, lighting and colour into a unified composition"],
            ["Asset Optimisation & Export", "Resolution, image dimensions, compression, PNG/JPEG/PDF/SVG selection and export settings"],
            ["Automation / Batch Processing", "Photoshop Actions, batch processing, Illustrator Actions, scripts or automated export processes"]
        ]
    }
};

const SUGGESTED_TECHNIQUES_BY_TOOL = {
    "html/css": ["Semantic HTML structure", "Responsive CSS layouts", "Accessible form labels", "Flexbox or CSS Grid", "Media queries"],
    "html": ["Semantic page structure", "Accessible headings", "Form validation", "Image alt text"],
    "css": ["Responsive layouts", "Flexbox or CSS Grid", "Reusable CSS classes", "Media queries"],
    "javascript": ["DOM event handling", "Form validation", "Fetch API requests", "Local storage", "Async functions"],
    "python": ["Functions and modules", "Lists and dictionaries", "Input validation", "File handling", "Debugging with tracebacks"],
    "java": ["Classes and methods", "Conditional logic", "Collections", "Exception handling"],
    "c#": ["Classes and methods", "Event handling", "Conditional logic", "Debugging"],
    "react": ["Reusable components", "State management", "Props", "Conditional rendering", "API data loading"],
    "github": ["Repository setup", "Feature branches", "Meaningful commits", "Pull requests", "Issue tracking"],
    "git": ["Version control commits", "Branching", "Merging changes", "Remote push and pull"],
    "vs code": ["Extensions", "Integrated terminal", "Debugging tools", "Source control panel"],
    "sql": ["SELECT queries", "Filtering with WHERE", "Table joins", "Parameterized queries"],
    "figma": ["Wireframes", "Reusable components", "Auto layout", "Prototype links", "User-interface design"],
    "trello": ["To Do task cards", "Kanban workflow", "Checklists", "Due dates", "Progress tracking"],
    "google drive": ["Folder organisation", "Shared permissions", "Version history", "File naming conventions"],
    "onedrive": ["Folder organisation", "Shared permissions", "Version history", "File naming conventions"]
};

const detailAllowedDomain =
    (document.querySelector('meta[name="hub-google-allowed-domain"]')?.content || "")
        .trim()
        .toLowerCase();

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function toSafeExternalUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
        const parsed = new URL(raw);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.toString();
        }
    } catch (_error) {
        return "";
    }

    return "";
}

function extractSlidesIdFromValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const direct = raw.match(/^[A-Za-z0-9_-]{20,}$/);
    if (direct?.[0]) return direct[0];

    const pathMatch = raw.match(/\/presentation\/d\/([A-Za-z0-9_-]{20,})/i);
    if (pathMatch?.[1]) return pathMatch[1];

    const queryIdMatch = raw.match(/[?&]id=([A-Za-z0-9_-]{20,})/i);
    if (queryIdMatch?.[1]) return queryIdMatch[1];

    return "";
}

function toGoogleSlidesThumbnailUrl(value) {
    const slideId = extractSlidesIdFromValue(value);
    if (!slideId) {
        return "";
    }
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(slideId)}&sz=w1400`;
}

function toSafeOneDriveFolderUrl(value) {
    const safeUrl = toSafeExternalUrl(value);
    if (!safeUrl) return "";
    return /(onedrive\.live\.com|1drv\.ms|sharepoint\.com)/i.test(safeUrl) ? safeUrl : "";
}

function toSafeGoogleDriveFolderUrl(value) {
    const safeUrl = toSafeExternalUrl(value);
    if (!safeUrl) return "";
    return /(drive\.google\.com)/i.test(safeUrl) ? safeUrl : "";
}

function toSafeGoogleFormUrl(value) {
    const safeUrl = toSafeExternalUrl(value);
    if (!safeUrl) return "";
    try {
        const host = String(new URL(safeUrl).hostname || "").toLowerCase();
        return host === "forms.gle" || host === "docs.google.com" && new URL(safeUrl).pathname.startsWith("/forms/")
            ? safeUrl
            : "";
    } catch (_error) {
        return "";
    }
}

function getDigiMedConventionsAcknowledgementKey(activityId, email) {
    return `${DIGIMED_CONVENTIONS_ACK_STORAGE_PREFIX}:${String(activityId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDigiMedConventionsAcknowledgements(activityId, email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDigiMedConventionsAcknowledgementKey(activityId, email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeDigiMedConventionsAcknowledgements(activityId, email, value) {
    try {
        localStorage.setItem(getDigiMedConventionsAcknowledgementKey(activityId, email), JSON.stringify(value || {}));
    } catch (_error) {
    }
    void persistDigiMedLocalState(activityId, email, "conventions", value);
}

function countDigiMedConventionsAcknowledgements(value) {
    return DIGIMED_CONVENTION_AREAS.filter((area) => Boolean(value?.[area])).length;
}

function getDigiMedImageConventionsAcknowledgementKey(activityId, email) {
    return `${DIGIMED_IMAGE_CONVENTIONS_ACK_STORAGE_PREFIX}:${String(activityId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDigiMedImageConventionsAcknowledgements(activityId, email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDigiMedImageConventionsAcknowledgementKey(activityId, email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeDigiMedImageConventionsAcknowledgements(activityId, email, value) {
    try {
        localStorage.setItem(getDigiMedImageConventionsAcknowledgementKey(activityId, email), JSON.stringify(value || {}));
    } catch (_error) {
    }
    void persistDigiMedLocalState(activityId, email, "image-conventions", value);
}

function buildDigiMedImageConventionsTable(activityId, email) {
    const acknowledgements = readDigiMedImageConventionsAcknowledgements(activityId, email);
    return `<section class="task-topic-guide-block" id="digimed-conventions-table"><h3>Conventions (IMAGE)</h3><p class="task-topic-submission-note">Review each image-production convention that applies to your outcome.</p><table class="digital-outcome-must-dos-table digital-outcome-conventions-table"><thead><tr><th>Convention area</th><th>What students should consider</th><th>Discussed</th></tr></thead><tbody>
        ${DIGIMED_IMAGE_CONVENTION_CHECKS.map(([area, description]) => `<tr><td>${escapeHtml(area)}</td><td>${escapeHtml(description)}</td><td class="digital-outcome-conventions-ack-cell"><label><input type="checkbox" data-digimed-image-convention-ack="${escapeHtml(area)}" ${acknowledgements[area] ? "checked" : ""}><span class="sr-only">Acknowledged ${escapeHtml(area)}</span></label></td></tr>`).join("")}
    </tbody></table></section>`;
}

function bindDigiMedImageConventionAcknowledgements(host, activityId, email) {
    const acknowledgements = readDigiMedImageConventionsAcknowledgements(activityId, email);
    host.querySelectorAll("[data-digimed-image-convention-ack]").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const area = String(checkbox.getAttribute("data-digimed-image-convention-ack") || "").trim();
            if (!area) return;
            acknowledgements[area] = Boolean(checkbox.checked);
            writeDigiMedImageConventionsAcknowledgements(activityId, email, acknowledgements);
        });
    });
}

function getDigiMedUXPrinciplesAcknowledgementKey(activityId, email) {
    return `${DIGIMED_UX_PRINCIPLES_ACK_STORAGE_PREFIX}:${String(activityId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDigiMedUXPrinciplesAcknowledgements(activityId, email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDigiMedUXPrinciplesAcknowledgementKey(activityId, email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeDigiMedUXPrinciplesAcknowledgements(activityId, email, value) {
    try {
        localStorage.setItem(getDigiMedUXPrinciplesAcknowledgementKey(activityId, email), JSON.stringify(value || {}));
    } catch (_error) {
    }
    void persistDigiMedLocalState(activityId, email, "ux-principles", value);
}

function countDigiMedUXPrinciplesAcknowledgements(value) {
    return DIGIMED_UX_PRINCIPLE_AREAS.filter((area) => Boolean(value?.[area])).length;
}

function getDigiMedVideoIntegrityKey(activityId, email) {
    return `${DIGIMED_VIDEO_INTEGRITY_ACK_STORAGE_PREFIX}:${String(activityId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDigiMedVideoIntegrityChecks(activityId, email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDigiMedVideoIntegrityKey(activityId, email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeDigiMedVideoIntegrityChecks(activityId, email, value) {
    try {
        localStorage.setItem(getDigiMedVideoIntegrityKey(activityId, email), JSON.stringify(value || {}));
    } catch (_error) {
    }
    void persistDigiMedLocalState(activityId, email, "video-integrity", value);
}

function getDigiMedImageIntegrityKey(activityId, email) {
    return `${DIGIMED_IMAGE_INTEGRITY_ACK_STORAGE_PREFIX}:${String(activityId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDigiMedImageIntegrityChecks(activityId, email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDigiMedImageIntegrityKey(activityId, email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeDigiMedImageIntegrityChecks(activityId, email, value) {
    try {
        localStorage.setItem(getDigiMedImageIntegrityKey(activityId, email), JSON.stringify(value || {}));
    } catch (_error) {
    }
    void persistDigiMedLocalState(activityId, email, "image-integrity", value);
}

function getDigiMedVideoUXKey(activityId, email) {
    return `${DIGIMED_VIDEO_UX_ACK_STORAGE_PREFIX}:${String(activityId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDigiMedVideoUXChecks(activityId, email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDigiMedVideoUXKey(activityId, email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeDigiMedVideoUXChecks(activityId, email, value) {
    try {
        localStorage.setItem(getDigiMedVideoUXKey(activityId, email), JSON.stringify(value || {}));
    } catch (_error) {
    }
    void persistDigiMedLocalState(activityId, email, "video-ux", value);
}

function getDigiMedVideoConventionsKey(activityId, email) {
    return `${DIGIMED_VIDEO_CONVENTIONS_ACK_STORAGE_PREFIX}:${String(activityId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDigiMedVideoConventionsChecks(activityId, email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDigiMedVideoConventionsKey(activityId, email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeDigiMedVideoConventionsChecks(activityId, email, value) {
    try {
        localStorage.setItem(getDigiMedVideoConventionsKey(activityId, email), JSON.stringify(value || {}));
    } catch (_error) {
    }
    void persistDigiMedLocalState(activityId, email, "video-conventions", value);
}

function getDigiMedVideoProductionProgressKey(activityId, email) {
    return `${DIGIMED_VIDEO_PRODUCTION_PROGRESS_STORAGE_PREFIX}:${String(activityId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDigiMedVideoProductionProgress(activityId, email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDigiMedVideoProductionProgressKey(activityId, email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeDigiMedVideoProductionProgress(activityId, email, value) {
    try {
        localStorage.setItem(getDigiMedVideoProductionProgressKey(activityId, email), JSON.stringify(value || {}));
    } catch (_error) {
    }
    void persistDigiMedLocalState(activityId, email, "video-production", value);
}

function getDigiMedWebProductionProgressKey(activityId, email) {
    return `${DIGIMED_WEB_PRODUCTION_PROGRESS_STORAGE_PREFIX}:${String(activityId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDigiMedWebProductionProgress(activityId, email) {
    try {
        const parsed = JSON.parse(localStorage.getItem(getDigiMedWebProductionProgressKey(activityId, email)) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function writeDigiMedWebProductionProgress(activityId, email, value) {
    try {
        localStorage.setItem(getDigiMedWebProductionProgressKey(activityId, email), JSON.stringify(value || {}));
    } catch (_error) {
    }
    void persistDigiMedLocalState(activityId, email, "web-production", value);
}

function parseDurationMinutes(raw) {
    const source = String(raw || "").trim().toLowerCase();
    const parsed = Number.parseInt(source.replace(/[^0-9]/g, ""), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return 120;
    if (source.includes("hr")) {
        return parsed * 60;
    }
    return parsed;
}

function asLines(value) {
    if (!Array.isArray(value)) return "";
    return value.join("\n");
}

function parseLines(value) {
    return String(value || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseRequirementLines(value) {
    const lines = parseLines(value);
    const results = [];
    const bulletSplitRegex = /[\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219]/;
    const bulletStartRegex = /^[\s\u2022\u25CF\u25E6\u25AA\u2023\u2043\u00B7\u2219]/;

    lines.forEach((line) => {
        const text = String(line || "").trim();
        if (!text) return;

        const withoutLevel = text.replace(/^(Achieved|Merit|Excellence)\s*:\s*/i, "").trim();
        if (!bulletSplitRegex.test(withoutLevel)) {
            results.push(withoutLevel.replace(/^[\-*]\s*/, "").trim());
            return;
        }

        const segments = withoutLevel
            .split(bulletSplitRegex)
            .map((segment) => segment.replace(/^[\-*]\s*/, "").trim())
            .filter(Boolean);

        if (!segments.length) return;
        const useAllSegments = bulletStartRegex.test(withoutLevel);
        const selected = useAllSegments ? segments : segments.slice(1);
        selected.forEach((segment) => {
            if (segment) results.push(segment);
        });
    });

    return results.filter(Boolean);
}

function coerceArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }

        if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("\"") && trimmed.endsWith("\""))) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map((item) => String(item || "").trim()).filter(Boolean);
                }
            } catch (_error) {
            }
        }

        return trimmed
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return [];
}

function splitRequirementSegments(value) {
    return parseRequirementLines(value);
}

function formatRequirementSteps(values, levelLabel) {
    const prefix = `${levelLabel}:`;
    return coerceArray(values)
        .flatMap((line) => splitRequirementSegments(line))
        .map((line) => (line.toLowerCase().startsWith(prefix.toLowerCase()) ? line : `${prefix} ${line}`))
        .filter(Boolean);
}

function buildRequirementSidebarSteps(detailData) {
    const achievedSteps = formatRequirementSteps(detailData?.achieved, "Achieved");
    const meritSteps = formatRequirementSteps(detailData?.merit, "Merit");
    const excellenceSteps = formatRequirementSteps(detailData?.excellence, "Excellence");
    return [...achievedSteps, ...meritSteps, ...excellenceSteps];
}

function buildTaskDefaultsByStandard(standards, detailData) {
    const requirementSteps = buildRequirementSidebarSteps(detailData);
    const map = {};
    (Array.isArray(standards) ? standards : []).forEach((code) => {
        const standardCode = String(code || "").trim();
        if (standardCode === "91897" && requirementSteps.length) {
            map[code] = requirementSteps;
            return;
        }

        map[code] = Array.isArray(EVIDENCE_STEPS_DEFAULTS[standardCode]) ? EVIDENCE_STEPS_DEFAULTS[standardCode] : [];
    });
    return map;
}

function expandBulletChecklistRows(rows) {
    const source = Array.isArray(rows) ? rows : [];
    const expanded = [];

    source.forEach((row) => {
        const text = String(row?.text || "").trim();
        const done = Boolean(row?.done);
        if (!text) {
            return;
        }

        const levelMatch = text.match(/^(Achieved|Merit|Excellence):\s*/i);
        const levelPrefix = levelMatch ? `${levelMatch[1]}: ` : "";
        const body = levelMatch ? text.replace(/^(Achieved|Merit|Excellence):\s*/i, "").trim() : text;

        const parts = body
            .replace(/\u2022/g, "•")
            .split("•")
            .map((item) => item.trim())
            .filter(Boolean);

        if (parts.length > 1) {
            parts.slice(1).forEach((item) => {
                expanded.push({ text: `${levelPrefix}${item}`, done });
            });
            return;
        }

        expanded.push({ text, done });
    });

    return expanded;
}

function normalize91897RowsWithRequirementFallback(existingRows, defaultRows) {
    const expandedExisting = expandBulletChecklistRows(existingRows);
    const defaults = Array.isArray(defaultRows)
        ? defaultRows.map((text) => ({ text: String(text || "").trim(), done: false })).filter((row) => row.text)
        : [];

    const ensuredSubitemText = "Achieved: List the key features or requirements the outcome must include.";

    const getLevel = (text) => {
        const raw = String(text || "").trim().toLowerCase();
        if (raw.startsWith("achieved:")) return "achieved";
        if (raw.startsWith("merit:")) return "merit";
        if (raw.startsWith("excellence:")) return "excellence";
        return "";
    };

    const ensureSubitemPlacement = (rows) => {
        const safeRows = Array.isArray(rows) ? rows.map((row) => ({
            text: String(row?.text || "").trim(),
            done: Boolean(row?.done)
        })).filter((row) => row.text) : [];

        if (safeRows.some((row) => isFeaturesRequirementSubitem(row.text))) {
            return safeRows;
        }

        const parentIndex = safeRows.findIndex((row) => isDecompositionParentStep(row.text));
        const nextRow = { text: ensuredSubitemText, done: false };
        if (parentIndex >= 0) {
            safeRows.splice(parentIndex + 1, 0, nextRow);
            return safeRows;
        }

        const firstNonAchievedIndex = safeRows.findIndex((row) => getLevel(row.text) && getLevel(row.text) !== "achieved");
        if (firstNonAchievedIndex >= 0) {
            safeRows.splice(firstNonAchievedIndex, 0, nextRow);
        } else {
            safeRows.push(nextRow);
        }

        return safeRows;
    };

    if (!defaults.length) {
        return ensureSubitemPlacement(expandedExisting);
    }

    const existingCounts = { achieved: 0, merit: 0, excellence: 0 };
    const defaultCounts = { achieved: 0, merit: 0, excellence: 0 };

    expandedExisting.forEach((row) => {
        const level = getLevel(row?.text);
        if (level) existingCounts[level] += 1;
    });
    defaults.forEach((row) => {
        const level = getLevel(row?.text);
        if (level) defaultCounts[level] += 1;
    });

    // Legacy shape to migrate: one long line per level while defaults have multiple items.
    const shouldRebuildFromRequirements =
        expandedExisting.length <= 3 ||
        existingCounts.achieved < defaultCounts.achieved ||
        existingCounts.merit < defaultCounts.merit ||
        existingCounts.excellence < defaultCounts.excellence;

    if (!shouldRebuildFromRequirements) {
        return ensureSubitemPlacement(expandedExisting);
    }

    const doneByText = new Map();
    expandedExisting.forEach((row) => {
        const key = String(row?.text || "").trim().toLowerCase();
        if (!key) return;
        doneByText.set(key, Boolean(row?.done));
    });

    return ensureSubitemPlacement(defaults.map((row) => {
        const key = String(row.text || "").trim().toLowerCase();
        return {
            text: row.text,
            done: doneByText.get(key) || false
        };
    }));
}

function normalizeStudentEmailInput(value) {
    const trimmed = String(value || "").trim().toLowerCase();
    if (!trimmed) return "";
    if (trimmed.includes("@")) return trimmed;
    if (detailAllowedDomain) {
        return `${trimmed}@${detailAllowedDomain}`;
    }
    return trimmed;
}

function isFeaturesRequirementSubitem(text) {
    const normalized = String(text || "")
        .replace(/^(Achieved|Merit|Excellence):\s*/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    return normalized.includes("list the key features")
        && normalized.includes("requirements")
        && normalized.includes("outcome");
}

function isDecompositionParentStep(text) {
    const normalized = String(text || "")
        .replace(/^(Achieved|Merit|Excellence):\s*/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    return normalized.includes("decompos")
        && normalized.includes("outcome")
        && normalized.includes("smaller components");
}

function normalizeCardCategory(value, fallback = "Activity") {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return fallback;

    if (raw === "project") return "Project";
    if (raw === "lesson") return "Lesson";
    if (raw === "assessment task" || raw === "assessment activity" || raw === "assessment") return "Assessment Task";
    if (raw === "activity" || raw === "skill activity" || raw === "practice" || raw === "practice activity") return "Activity";

    return fallback;
}

function getDefaultCardColorForCategory(categoryValue) {
    const category = String(categoryValue || "").trim().toLowerCase();

    if (category.includes("task topic")) return "Azure";
    if (category.includes("standard")) return "Teal";
    if (category.includes("lesson")) return "Rose";
    if (category.includes("assessment")) return "Slate";
    if (category.includes("project")) return "Violet";
    if (category.includes("activity") || category.includes("practice")) return "Amber";

    return "Amber";
}

function isGeneratedUploadedActivityImageUrl(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) {
        return false;
    }

    return raw.includes("placehold.co/900x560/3f89cf/ffffff")
        && raw.includes("uploaded+activity");
}

function readStoredHubEmail() {
    const raw = localStorage.getItem(DETAIL_HUB_AUTH_STORAGE_KEY) || sessionStorage.getItem(DETAIL_HUB_AUTH_STORAGE_KEY);
    if (!raw) return "";

    try {
        const parsed = JSON.parse(raw);
        return String(parsed?.profile?.email || "").trim().toLowerCase();
    } catch (_error) {
        return "";
    }
}

function readStoredHubAccessToken() {
    const raw = localStorage.getItem(DETAIL_HUB_AUTH_STORAGE_KEY) || sessionStorage.getItem(DETAIL_HUB_AUTH_STORAGE_KEY);
    if (!raw) return "";

    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) {
            return "";
        }
        return String(parsed?.idToken || parsed?.accessToken || "").trim();
    } catch (_error) {
        return "";
    }
}

function readStoredHubDriveAccessToken() {
    const raw = localStorage.getItem(DETAIL_HUB_AUTH_STORAGE_KEY) || sessionStorage.getItem(DETAIL_HUB_AUTH_STORAGE_KEY);
    if (!raw) return "";

    try {
        const parsed = JSON.parse(raw);
        if (!parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) {
            return "";
        }

        // Drive API calls must use the OAuth access token, not the ID token.
        const driveAccessToken = String(parsed?.accessToken || "").trim();
        if (driveAccessToken) {
            return driveAccessToken;
        }

        return String(parsed?.idToken || "").trim();
    } catch (_error) {
        return "";
    }
}

function buildAuthHeaders(headers = {}) {
    const email = readStoredHubEmail();
    const nextHeaders = { ...headers };
    if (email) {
        nextHeaders["x-user-email"] = email;
    }

    const accessToken = readStoredHubAccessToken();
    if (accessToken && accessToken.startsWith("eyJ") && accessToken.split(".").length === 3) {
        nextHeaders.Authorization = `Bearer ${accessToken}`;
    }

    return nextHeaders;
}

function buildWriteHeaders() {
    return buildAuthHeaders({ "Content-Type": "application/json" });
}

function getActiveSyncContext() {
    const params = new URLSearchParams(window.location.search || "");
    const projectId = String(params.get("id") || "").trim();
    const email = readStoredHubEmail();
    const taskTopicValue = String(params.get("taskTopic") || "").trim();
    const detailData = projectId ? (DETAIL_DATA?.[projectId] || null) : null;

    return {
        projectId,
        email,
        taskTopicValue,
        detailData
    };
}

async function fetchStudentProcessAssessmentFolderUrl() {
    try {
        const response = await fetch("/api/student/drive-setup", { headers: buildWriteHeaders() });
        if (!response.ok) {
            return "";
        }

        const payload = await response.json().catch(() => ({}));
        const directUrl = toSafeExternalUrl(payload?.processAssessmentFolderUrl || "");
        if (directUrl) {
            return directUrl;
        }

        const folderId = String(payload?.processAssessmentFolderId || "").trim();
        if (!folderId) {
            return "";
        }
        return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
    } catch (_error) {
        return "";
    }
}

async function findProcessAssessmentSlideMatch(taskTopic = "") {
    const accessToken = readStoredHubDriveAccessToken();
    if (!accessToken) {
        return { fileUrl: "", fileName: "", thumbnailUrl: "", modifiedTime: "" };
    }

    try {
        const response = await fetch("/api/student/drive-setup/find-slide", {
            method: "POST",
            headers: buildWriteHeaders(),
            body: JSON.stringify({
                driveAccessToken: accessToken,
                taskTopic: String(taskTopic || "").trim()
            })
        });

        if (!response.ok) {
            return { fileUrl: "", fileName: "", thumbnailUrl: "", modifiedTime: "" };
        }

        const payload = await response.json().catch(() => ({}));
        return {
            fileUrl: toSafeExternalUrl(payload?.fileUrl || ""),
            fileName: String(payload?.fileName || "").trim(),
            thumbnailUrl: toSafeExternalUrl(payload?.thumbnailUrl || ""),
            modifiedTime: String(payload?.modifiedTime || "").trim()
        };
    } catch (_error) {
        return { fileUrl: "", fileName: "", thumbnailUrl: "", modifiedTime: "" };
    }
}

async function fetchTemplateLibraryPreviewByTemplateId(templateId = "") {
    const targetTemplateId = String(templateId || "").trim();
    if (!targetTemplateId) {
        return "";
    }

    try {
        const response = await fetch("/api/template-library", { headers: buildAuthHeaders({}) });
        if (!response.ok) {
            return "";
        }

        const payload = await response.json().catch(() => ({}));
        const entries = Array.isArray(payload?.entries) ? payload.entries : [];
        const match = entries.find((entry) => String(entry?.id || "").trim().toLowerCase() === targetTemplateId.toLowerCase())
            || (targetTemplateId === "trialling-components"
                ? entries.find((entry) => /triall?ing\s+components|trailing\s+components|trailing\s+comonents/i.test(String(entry?.title || "")))
                : null)
            || (targetTemplateId === "tools-and-techniques"
                ? entries.find((entry) => /tools\s*(&|and)\s*techniques/i.test(String(entry?.title || "")))
                : null)
            || (targetTemplateId === "use-of-tools-and-techniques"
                ? entries.find((entry) => /use\s+of\s+tools\s*(&|and)\s*techniques/i.test(String(entry?.title || "")))
                : null)
            || (targetTemplateId === "relevant-digimed-conventions"
                ? entries.find((entry) => /relevant.*conventions/i.test(String(entry?.title || "")))
                : null)
            || (targetTemplateId === "project-management"
                ? entries.find((entry) => /project\s+management/i.test(String(entry?.title || "")))
                : null);
        if (!match) {
            return "";
        }

        // Match the Template Library, which previews by file id (stored thumbnail links can expire).
        if (targetTemplateId === "use-of-tools-and-techniques") {
            const fileThumbnail = toGoogleSlidesThumbnailUrl(match?.templateUrl || "");
            if (fileThumbnail) return fileThumbnail;
        }

        return toSafeExternalUrl(match?.imageUrl || "")
            || toGoogleSlidesThumbnailUrl(match?.templateUrl || "")
            || toGoogleSlidesThumbnailUrl(match?.fileUrl || "");
    } catch (_error) {
        return "";
    }
}

async function fetchTeacherTemplateLibraryEntry(templateId = "") {
    const targetTemplateId = String(templateId || "").trim().toLowerCase();
    if (!targetTemplateId) return null;

    try {
        const response = await fetch("/api/template-library", { headers: buildAuthHeaders({}) });
        if (!response.ok) return null;
        const payload = await response.json().catch(() => ({}));
        const entries = Array.isArray(payload?.entries) ? payload.entries : [];
        return entries.find((entry) => String(entry?.id || "").trim().toLowerCase() === targetTemplateId)
            || (targetTemplateId === "relevant-digimed-conventions"
                ? entries.find((entry) => /relevant.*conventions/i.test(String(entry?.title || "")))
                : null);
    } catch (_error) {
        return null;
    }
}

function installCloudSyncDelegatedFallbackHandlers() {
    if (window.__dtechCloudSyncFallbackBound) {
        return;
    }
    window.__dtechCloudSyncFallbackBound = true;

    const setStatus = (selector, message, isError = false) => {
        const el = document.querySelector(selector);
        if (!el) return;
        el.textContent = String(message || "");
        el.classList.toggle("is-error", Boolean(isError));
    };

    const readUrlValue = (selector) => toSafeExternalUrl(document.querySelector(selector)?.value || "");

    const refreshTrelloLibraryUi = (projectId, email) => {
        const library = document.querySelector("#trello-link-library");
        const list = document.querySelector("#trello-link-library-list");
        const count = document.querySelector("#trello-link-library-count");
        if (!library || !list) {
            return;
        }

        const items = readStoredTrelloCardLibrary(projectId, email);
        if (!items.length) {
            library.hidden = true;
            if (count) count.textContent = "(0)";
            list.innerHTML = "";
            return;
        }

        const activeUrl = toSafeTrelloCardUrl(document.querySelector("#trello-card-url")?.value || "");
        library.hidden = false;
        if (count) count.textContent = `(${items.length})`;
        list.innerHTML = items
            .map((item) => {
                const url = toSafeTrelloCardUrl(item?.url || "");
                if (!url) {
                    return "";
                }
                const isActive = Boolean(activeUrl && activeUrl === url);
                const isFavourite = Boolean(item?.favourite);
                return `
                    <li class="trello-link-library-item${isActive ? " is-active" : ""}${isFavourite ? " is-favourite" : ""}" data-trello-link-item="${escapeHtml(url)}">
                        <div class="trello-link-library-link-wrap">
                            <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item?.savedAt))}</span>
                            ${isFavourite ? `<span class="trello-link-library-favourite-badge">&#9733; Favourite</span>` : ""}
                        </div>
                        <div class="trello-link-library-actions">
                            <button type="button" class="trello-link-library-favourite-btn${isFavourite ? " is-favourite" : ""}" data-trello-library-favourite="${escapeHtml(url)}" aria-pressed="${isFavourite ? "true" : "false"}" title="${isFavourite ? "Favourite link used by Decomposition" : "Mark as Favourite"}">${isFavourite ? "&#9733;" : "&#9734;"}</button>
                            <button type="button" class="detail-action detail-action-secondary" data-trello-library-use="${escapeHtml(url)}">Use</button>
                            <button type="button" class="detail-action detail-action-secondary" data-trello-library-open="${escapeHtml(url)}">Open</button>
                            <button type="button" class="detail-action detail-action-danger" data-trello-library-delete="${escapeHtml(url)}">Delete</button>
                        </div>
                    </li>
                `;
            })
            .join("");
    };

    const refreshOneDriveLibraryUi = (projectId, email) => {
        const library = document.querySelector("#onedrive-link-library");
        const list = document.querySelector("#onedrive-link-library-list");
        const count = document.querySelector("#onedrive-link-library-count");
        if (!library || !list) {
            return;
        }

        const items = readStoredOneDriveLinkLibrary(projectId, email);
        if (!items.length) {
            library.hidden = true;
            if (count) count.textContent = "(0)";
            list.innerHTML = "";
            return;
        }

        const activeUrl = toSafeOneDriveFolderUrl(document.querySelector("#onedrive-folder-url")?.value || "");
        library.hidden = false;
        if (count) count.textContent = `(${items.length})`;
        list.innerHTML = items
            .map((item) => {
                const url = toSafeOneDriveFolderUrl(item?.url || "");
                if (!url) {
                    return "";
                }
                const isActive = Boolean(activeUrl && activeUrl === url);
                return `
                    <li class="trello-link-library-item${isActive ? " is-active" : ""}" data-onedrive-link-item="${escapeHtml(url)}">
                        <div class="trello-link-library-link-wrap">
                            <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item?.savedAt))}</span>
                        </div>
                        <div class="trello-link-library-actions">
                            <button type="button" class="detail-action detail-action-secondary" data-onedrive-library-use="${escapeHtml(url)}">Use</button>
                            <button type="button" class="detail-action detail-action-secondary" data-onedrive-library-open="${escapeHtml(url)}">Open</button>
                            <button type="button" class="detail-action detail-action-danger" data-onedrive-library-delete="${escapeHtml(url)}">Delete</button>
                        </div>
                    </li>
                `;
            })
            .join("");
    };

    const refreshGoogleDriveLibraryUi = (projectId, email) => {
        const library = document.querySelector("#google-drive-link-library");
        const list = document.querySelector("#google-drive-link-library-list");
        const count = document.querySelector("#google-drive-link-library-count");
        if (!library || !list) {
            return;
        }

        const items = readStoredGoogleDriveLinkLibrary(projectId, email);
        if (!items.length) {
            library.hidden = true;
            if (count) count.textContent = "(0)";
            list.innerHTML = "";
            return;
        }

        const activeUrl = toSafeGoogleDriveFolderUrl(document.querySelector("#google-drive-folder-url")?.value || "");
        library.hidden = false;
        if (count) count.textContent = `(${items.length})`;
        list.innerHTML = items
            .map((item) => {
                const url = toSafeGoogleDriveFolderUrl(item?.url || "");
                if (!url) {
                    return "";
                }
                const isActive = Boolean(activeUrl && activeUrl === url);
                return `
                    <li class="trello-link-library-item${isActive ? " is-active" : ""}" data-google-drive-link-item="${escapeHtml(url)}">
                        <div class="trello-link-library-link-wrap">
                            <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item?.savedAt))}</span>
                        </div>
                        <div class="trello-link-library-actions">
                            <button type="button" class="detail-action detail-action-secondary" data-google-drive-library-use="${escapeHtml(url)}">Use</button>
                            <button type="button" class="detail-action detail-action-secondary" data-google-drive-library-open="${escapeHtml(url)}">Open</button>
                            <button type="button" class="detail-action detail-action-danger" data-google-drive-library-delete="${escapeHtml(url)}">Delete</button>
                        </div>
                    </li>
                `;
            })
            .join("");
    };

    const refreshGithubLibraryUi = (projectId, email) => {
        const list = document.querySelector("#github-link-library-list");
        const library = document.querySelector("#github-link-library");
        const count = document.querySelector("#github-link-library-count");
        if (!library || !list) {
            return;
        }

        const items = readStoredGithubRepoLibrary(projectId, email);
        if (!items.length) {
            library.hidden = true;
            if (count) count.textContent = "(0)";
            list.innerHTML = "";
            return;
        }

        const activeUrl = toSafeGithubRepoUrl(document.querySelector("#github-repo-url")?.value || "");
        library.hidden = false;
        if (count) count.textContent = `(${items.length})`;
        list.innerHTML = items
            .map((item) => {
                const url = toSafeGithubRepoUrl(item?.url || "");
                if (!url) {
                    return "";
                }
                const isActive = Boolean(activeUrl && activeUrl === url);
                return `
                    <li class="trello-link-library-item${isActive ? " is-active" : ""}" data-github-link-item="${escapeHtml(url)}">
                        <div class="trello-link-library-link-wrap">
                            <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item?.savedAt))}</span>
                        </div>
                        <div class="trello-link-library-actions">
                            <button type="button" class="detail-action detail-action-secondary" data-github-library-use="${escapeHtml(url)}">Use</button>
                            <button type="button" class="detail-action detail-action-secondary" data-github-library-open="${escapeHtml(url)}">Open</button>
                            <button type="button" class="detail-action detail-action-danger" data-github-library-delete="${escapeHtml(url)}">Delete</button>
                        </div>
                    </li>
                `;
            })
            .join("");
    };

    document.addEventListener("click", async (event) => {
        const button = event.target?.closest?.("button");
        if (!button) {
            return;
        }

        const favouriteTrelloLibraryBtn = button.closest("[data-trello-library-favourite]");
        if (favouriteTrelloLibraryBtn) {
            const selectedUrl = toSafeTrelloCardUrl(favouriteTrelloLibraryBtn.getAttribute("data-trello-library-favourite") || "");
            if (!selectedUrl) {
                return;
            }
            const ctx = getActiveSyncContext();
            setFavouriteTrelloCardLibraryLink(ctx.projectId, ctx.email, selectedUrl);
            setStatus("#trello-sync-status", "Set as Favourite Trello link for Decomposition.");
            if (ctx.projectId && ctx.email) {
                refreshTrelloLibraryUi(ctx.projectId, ctx.email);
            }
            return;
        }

        const deleteTrelloLibraryBtn = button.closest("[data-trello-library-delete]");
        if (deleteTrelloLibraryBtn) {
            const selectedUrl = toSafeTrelloCardUrl(deleteTrelloLibraryBtn.getAttribute("data-trello-library-delete") || "");
            if (!selectedUrl || !window.confirm("Delete this saved Trello link?")) {
                return;
            }
            const ctx = getActiveSyncContext();
            deleteTrelloLibraryBtn.disabled = true;
            try {
                await removeUrlFromEvidenceSteps(ctx.projectId, ctx.email, selectedUrl, ["TRELLO_CARD_URL|"]);
                removeStoredTrelloCardLibraryLink(ctx.projectId, ctx.email, selectedUrl);
                const input = document.querySelector("#trello-card-url");
                if (input && toSafeTrelloCardUrl(input.value || "") === selectedUrl) {
                    input.value = "";
                }
                setStatus("#trello-sync-status", "Removed saved Trello link.");
            } catch (_error) {
                setStatus("#trello-sync-status", "Could not remove that Trello link.", true);
            } finally {
                if (ctx.projectId && ctx.email) {
                    refreshTrelloLibraryUi(ctx.projectId, ctx.email);
                }
            }
            return;
        }

        const deleteGithubLibraryBtn = button.closest("[data-github-library-delete]");
        if (deleteGithubLibraryBtn) {
            const selectedUrl = toSafeGithubRepoUrl(deleteGithubLibraryBtn.getAttribute("data-github-library-delete") || "");
            if (!selectedUrl || !window.confirm("Delete this saved GitHub link?")) {
                return;
            }
            const ctx = getActiveSyncContext();
            deleteGithubLibraryBtn.disabled = true;
            try {
                await removeUrlFromEvidenceSteps(ctx.projectId, ctx.email, selectedUrl, ["GITHUB_REPO_URL|"]);
                removeStoredGithubRepoLibraryLink(ctx.projectId, ctx.email, selectedUrl);
                const input = document.querySelector("#github-repo-url");
                if (input && toSafeGithubRepoUrl(input.value || "") === selectedUrl) {
                    input.value = "";
                }
                setStatus("#github-sync-status", "Removed saved GitHub link.");
            } catch (_error) {
                setStatus("#github-sync-status", "Could not remove that GitHub link.", true);
            } finally {
                if (ctx.projectId && ctx.email) {
                    refreshGithubLibraryUi(ctx.projectId, ctx.email);
                }
            }
            return;
        }

        const deleteOneDriveLibraryBtn = button.closest("[data-onedrive-library-delete]");
        if (deleteOneDriveLibraryBtn) {
            const selectedUrl = toSafeOneDriveFolderUrl(deleteOneDriveLibraryBtn.getAttribute("data-onedrive-library-delete") || "");
            if (!selectedUrl || !window.confirm("Delete this saved OneDrive link?")) {
                return;
            }
            const ctx = getActiveSyncContext();
            deleteOneDriveLibraryBtn.disabled = true;
            try {
                await removeUrlFromEvidenceSteps(ctx.projectId, ctx.email, selectedUrl, ["ONEDRIVE_PROJECT_FOLDER_URL|", "MEDIA_ASSET_FOLDER_URL|"]);
                removeStoredOneDriveLinkLibraryLink(ctx.projectId, ctx.email, selectedUrl);
                const input = document.querySelector("#onedrive-folder-url");
                if (input && toSafeOneDriveFolderUrl(input.value || "") === selectedUrl) {
                    input.value = "";
                }
                setStatus("#onedrive-sync-status", "Removed saved OneDrive link.");
            } catch (_error) {
                setStatus("#onedrive-sync-status", "Could not remove that OneDrive link.", true);
            } finally {
                if (ctx.projectId && ctx.email) {
                    refreshOneDriveLibraryUi(ctx.projectId, ctx.email);
                }
            }
            return;
        }

        const deleteGoogleLibraryBtn = button.closest("[data-google-drive-library-delete]");
        if (deleteGoogleLibraryBtn) {
            const selectedUrl = toSafeGoogleDriveFolderUrl(deleteGoogleLibraryBtn.getAttribute("data-google-drive-library-delete") || "");
            if (!selectedUrl || !window.confirm("Delete this saved Google Drive link?")) {
                return;
            }
            const ctx = getActiveSyncContext();
            deleteGoogleLibraryBtn.disabled = true;
            try {
                await removeUrlFromEvidenceSteps(ctx.projectId, ctx.email, selectedUrl, ["GOOGLE_DRIVE_PROJECT_FOLDER_URL|"]);
                removeStoredGoogleDriveLinkLibraryLink(ctx.projectId, ctx.email, selectedUrl);
                const input = document.querySelector("#google-drive-folder-url");
                if (input && toSafeGoogleDriveFolderUrl(input.value || "") === selectedUrl) {
                    input.value = "";
                }
                setStatus("#google-drive-sync-status", "Removed saved Google Drive link.");
            } catch (_error) {
                setStatus("#google-drive-sync-status", "Could not remove that Google Drive link.", true);
            } finally {
                if (ctx.projectId && ctx.email) {
                    refreshGoogleDriveLibraryUi(ctx.projectId, ctx.email);
                }
            }
            return;
        }

        const useGoogleLibraryBtn = button.closest("[data-google-drive-library-use]");
        if (useGoogleLibraryBtn) {
            if (document.querySelector("#google-drive-save-link-btn")?.dataset?.syncBound === "1") {
                return;
            }
            const selectedUrl = toSafeGoogleDriveFolderUrl(useGoogleLibraryBtn.getAttribute("data-google-drive-library-use") || "");
            if (!selectedUrl) {
                return;
            }
            const input = document.querySelector("#google-drive-folder-url");
            if (input) {
                input.value = selectedUrl;
            }
            setStatus("#google-drive-sync-status", "Selected saved Google Drive link.");
            const ctx = getActiveSyncContext();
            if (ctx.projectId && ctx.email) {
                refreshGoogleDriveLibraryUi(ctx.projectId, ctx.email);
            }
            return;
        }

        const openGoogleLibraryBtn = button.closest("[data-google-drive-library-open]");
        if (openGoogleLibraryBtn) {
            if (document.querySelector("#google-drive-save-link-btn")?.dataset?.syncBound === "1") {
                return;
            }
            const selectedUrl = toSafeGoogleDriveFolderUrl(openGoogleLibraryBtn.getAttribute("data-google-drive-library-open") || "");
            if (!selectedUrl) {
                return;
            }
            window.open(selectedUrl, "_blank", "noopener,noreferrer");
            setStatus("#google-drive-sync-status", "Opened saved Google Drive link.");
            return;
        }

        if (button.id === "onedrive-open-folder-btn" && button.dataset.syncBound !== "1") {
            const url = readUrlValue("#onedrive-folder-url");
            if (!url) {
                setStatus("#onedrive-sync-status", "Enter a valid OneDrive or SharePoint folder link first.", true);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
            setStatus("#onedrive-sync-status", "Opened OneDrive folder.");
            return;
        }

        if (button.id === "google-drive-open-folder-btn" && button.dataset.syncBound !== "1") {
            const url = toSafeGoogleDriveFolderUrl(document.querySelector("#google-drive-folder-url")?.value || "");
            if (!url) {
                setStatus("#google-drive-sync-status", "Enter a valid Google Drive folder link first.", true);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
            setStatus("#google-drive-sync-status", "Opened Google Drive folder.");
            return;
        }

        if (button.id === "onedrive-save-link-btn" && button.dataset.syncBound !== "1") {
            const url = readUrlValue("#onedrive-folder-url");
            if (!url) {
                setStatus("#onedrive-sync-status", "Enter a valid OneDrive or SharePoint folder link first.", true);
                return;
            }

            const ctx = getActiveSyncContext();
            if (!ctx.projectId || !ctx.email || !ctx.taskTopicValue) {
                setStatus("#onedrive-sync-status", "Open a task-topic page before saving OneDrive link.", true);
                return;
            }

            button.disabled = true;
            setStatus("#onedrive-sync-status", "Saving OneDrive link...");
            try {
                await persistStudentOneDriveFolderLink(ctx.projectId, ctx.email, ctx.detailData, ctx.taskTopicValue, url);
                addStoredOneDriveLinkLibraryLink(ctx.projectId, ctx.email, url);
                refreshOneDriveLibraryUi(ctx.projectId, ctx.email);
                setStatus("#onedrive-sync-status", "OneDrive link saved and shared with teacher view.");
            } catch (error) {
                const fallback = "Could not save OneDrive link right now.";
                setStatus("#onedrive-sync-status", `${error?.message || fallback}${formatApiDebugSuffix(error)}`, true);
            } finally {
                if (button.isConnected) button.disabled = false;
            }
            return;
        }

        if (button.id === "google-drive-save-link-btn" && button.dataset.syncBound !== "1") {
            const url = toSafeGoogleDriveFolderUrl(document.querySelector("#google-drive-folder-url")?.value || "");
            if (!url) {
                setStatus("#google-drive-sync-status", "Enter a valid Google Drive folder link first.", true);
                return;
            }

            const ctx = getActiveSyncContext();
            if (!ctx.projectId || !ctx.email || !ctx.taskTopicValue) {
                setStatus("#google-drive-sync-status", "Open a task-topic page before saving Google Drive link.", true);
                return;
            }

            button.disabled = true;
            setStatus("#google-drive-sync-status", "Saving Google Drive link...");
            try {
                await persistStudentGoogleDriveFolderLink(ctx.projectId, ctx.email, ctx.detailData, ctx.taskTopicValue, url);
                addStoredGoogleDriveLinkLibraryLink(ctx.projectId, ctx.email, url);
                refreshGoogleDriveLibraryUi(ctx.projectId, ctx.email);
                setStatus("#google-drive-sync-status", "Google Drive link saved and shared with teacher view.");
            } catch (error) {
                const fallback = "Could not save Google Drive link right now.";
                setStatus("#google-drive-sync-status", `${error?.message || fallback}${formatApiDebugSuffix(error)}`, true);
            } finally {
                if (button.isConnected) button.disabled = false;
            }
        }

        if (button.id === "trello-save-link-btn" && button.dataset.syncBound !== "1") {
            const url = toSafeTrelloCardUrl(document.querySelector("#trello-card-url")?.value || "");
            if (!url) {
                setStatus("#trello-sync-status", "Enter a valid Trello card or board link first.", true);
                return;
            }

            const ctx = getActiveSyncContext();
            if (!ctx.projectId || !ctx.email) {
                setStatus("#trello-sync-status", "Sign in again, then retry Save Trello Link.", true);
                return;
            }

            button.disabled = true;
            setStatus("#trello-sync-status", "Saving Trello link...");
            try {
                await persistStudentTrelloLinkDirectlyToEvidence(ctx.projectId, ctx.email, ctx.detailData, ctx.taskTopicValue, url);
                addStoredTrelloCardLibraryLink(ctx.projectId, ctx.email, url);
                refreshTrelloLibraryUi(ctx.projectId, ctx.email);
                setStatus("#trello-sync-status", "Trello link saved.");
            } catch (error) {
                setStatus("#trello-sync-status", `${error?.message || "Could not save Trello link right now."}${formatApiDebugSuffix(error)}`, true);
            } finally {
                if (button.isConnected) button.disabled = false;
            }
            return;
        }

        if (button.id === "trello-open-card-btn" && button.dataset.syncBound !== "1") {
            const url = toSafeTrelloCardUrl(document.querySelector("#trello-card-url")?.value || "");
            if (!url) {
                setStatus("#trello-sync-status", "Enter a valid Trello card or board link first.", true);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
            setStatus("#trello-sync-status", "Opened Trello link.");
            return;
        }

        if (button.id === "github-save-link-btn" && button.dataset.syncBound !== "1") {
            const repoUrl = toSafeGithubRepoUrl(document.querySelector("#github-repo-url")?.value || "");
            if (!repoUrl) {
                setStatus("#github-sync-status", "Enter a valid GitHub repository URL first.", true);
                return;
            }

            const note = String(document.querySelector("#github-work-note")?.value || "").trim();
            const ctx = getActiveSyncContext();
            if (!ctx.projectId || !ctx.email) {
                setStatus("#github-sync-status", "Sign in again, then retry Save GitHub Sync.", true);
                return;
            }

            button.disabled = true;
            setStatus("#github-sync-status", "Saving GitHub sync...");
            try {
                await persistStudentGithubSyncDirectlyToEvidence(ctx.projectId, ctx.email, ctx.detailData, ctx.taskTopicValue, repoUrl, note);
                addStoredGithubRepoLibraryLink(ctx.projectId, ctx.email, repoUrl);
                setStatus("#github-sync-status", "GitHub sync saved.");
            } catch (error) {
                setStatus("#github-sync-status", `${error?.message || "Could not save GitHub sync right now."}${formatApiDebugSuffix(error)}`, true);
            } finally {
                if (button.isConnected) button.disabled = false;
            }
            return;
        }

        if (button.id === "github-open-repo-btn" && button.dataset.syncBound !== "1") {
            const repoUrl = toSafeGithubRepoUrl(document.querySelector("#github-repo-url")?.value || "");
            if (!repoUrl) {
                setStatus("#github-sync-status", "Enter a valid GitHub repository URL first.", true);
                return;
            }
            window.open(repoUrl, "_blank", "noopener,noreferrer");
            setStatus("#github-sync-status", "Opened GitHub repository.");
            return;
        }
    });

    document.addEventListener("click", async (event) => {
        const button = event.target?.closest?.("button");
        if (!button) {
            return;
        }

        if (
            button.id !== "trello-save-link-btn"
            && button.id !== "trello-open-card-btn"
            && button.id !== "github-save-link-btn"
            && button.id !== "github-open-repo-btn"
        ) {
            return;
        }

        event.stopImmediatePropagation();

        if (button.id === "github-open-repo-btn") {
            const repoUrl = toSafeGithubRepoUrl(document.querySelector("#github-repo-url")?.value || "");
            if (!repoUrl) {
                setStatus("#github-sync-status", "Enter a valid GitHub repository URL first.", true);
                return;
            }
            window.open(repoUrl, "_blank", "noopener,noreferrer");
            setStatus("#github-sync-status", "Opened GitHub repository.");
            return;
        }

        if (button.id === "github-save-link-btn") {
            const repoUrl = toSafeGithubRepoUrl(document.querySelector("#github-repo-url")?.value || "");
            if (!repoUrl) {
                setStatus("#github-sync-status", "Enter a valid GitHub repository URL first.", true);
                return;
            }

            const note = String(document.querySelector("#github-work-note")?.value || "").trim();
            const ctx = getActiveSyncContext();
            if (!ctx.projectId || !ctx.email) {
                setStatus("#github-sync-status", "Sign in again, then retry Save GitHub Sync.", true);
                return;
            }

            button.disabled = true;
            setStatus("#github-sync-status", "Saving GitHub sync...");
            try {
                await persistStudentGithubSyncDirectlyToEvidence(ctx.projectId, ctx.email, ctx.detailData, ctx.taskTopicValue, repoUrl, note);
                addStoredGithubRepoLibraryLink(ctx.projectId, ctx.email, repoUrl);
                setStatus("#github-sync-status", "GitHub sync saved.");
            } catch (error) {
                setStatus("#github-sync-status", `${error?.message || "Could not save GitHub sync right now."}${formatApiDebugSuffix(error)}`, true);
            } finally {
                if (button.isConnected) button.disabled = false;
            }
            return;
        }

        const url = toSafeTrelloCardUrl(document.querySelector("#trello-card-url")?.value || "");
        if (button.id === "trello-open-card-btn") {
            if (!url) {
                setStatus("#trello-sync-status", "Enter a valid Trello card or board link first.", true);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
            setStatus("#trello-sync-status", "Opened Trello link.");
            return;
        }

        if (!url) {
            setStatus("#trello-sync-status", "Enter a valid Trello card or board link first.", true);
            return;
        }

        const ctx = getActiveSyncContext();
        if (!ctx.projectId || !ctx.email) {
            setStatus("#trello-sync-status", "Sign in again, then retry Save Trello Link.", true);
            return;
        }

        button.disabled = true;
        setStatus("#trello-sync-status", "Saving Trello link...");
        try {
            await persistStudentTrelloLinkDirectlyToEvidence(ctx.projectId, ctx.email, ctx.detailData, ctx.taskTopicValue, url);
            addStoredTrelloCardLibraryLink(ctx.projectId, ctx.email, url);
            refreshTrelloLibraryUi(ctx.projectId, ctx.email);
            setStatus("#trello-sync-status", "Trello link saved.");
        } catch (error) {
            setStatus("#trello-sync-status", `${error?.message || "Could not save Trello link right now."}${formatApiDebugSuffix(error)}`, true);
        } finally {
            if (button.isConnected) button.disabled = false;
        }
    }, true);
}

function formatApiDebugSuffix(error) {
    const parts = [];
    if (Number.isFinite(Number(error?.status)) && Number(error.status) > 0) {
        parts.push(`status ${Number(error.status)}`);
    }
    if (error?.stage) {
        parts.push(`stage ${String(error.stage)}`);
    }
    if (error?.endpoint) {
        parts.push(String(error.endpoint));
    }

    return parts.length ? ` [debug: ${parts.join(" | ")}]` : "";
}

function getTrelloCardStorageKey(projectId, email) {
    return `${TRELLO_CARD_LINK_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function getTrelloCardLibraryStorageKey(projectId, email) {
    return `${TRELLO_CARD_LIBRARY_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function getGithubRepoLibraryStorageKey(projectId, email) {
    return `${GITHUB_REPO_LIBRARY_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function getOneDriveLinkLibraryStorageKey(projectId, email) {
    return `${ONEDRIVE_LINK_LIBRARY_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function getGoogleDriveLinkLibraryStorageKey(projectId, email) {
    return `${GOOGLE_DRIVE_LINK_LIBRARY_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function getGoogleFormLinkLibraryStorageKey(projectId, email) {
    return `${GOOGLE_FORM_LINK_LIBRARY_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function normalizeGoogleFormLinkLibrary(values) {
    const seen = new Set();
    const list = [];
    (Array.isArray(values) ? values : []).forEach((value) => {
        const candidateUrl = typeof value === "object" && value ? value.url : value;
        const safeUrl = toSafeGoogleFormUrl(candidateUrl);
        if (!safeUrl || seen.has(safeUrl)) return;
        seen.add(safeUrl);
        const parsed = typeof value === "object" && value ? Date.parse(String(value.savedAt || "")) : NaN;
        list.push({ url: safeUrl, savedAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : "" });
    });
    return list.slice(0, 12);
}

function readStoredGoogleFormLinkLibrary(projectId, email) {
    try {
        return normalizeGoogleFormLinkLibrary(JSON.parse(localStorage.getItem(getGoogleFormLinkLibraryStorageKey(projectId, email)) || "[]"));
    } catch (_error) {
        return [];
    }
}

function writeStoredGoogleFormLinkLibrary(projectId, email, values) {
    const next = normalizeGoogleFormLinkLibrary(values);
    try {
        const key = getGoogleFormLinkLibraryStorageKey(projectId, email);
        if (next.length) localStorage.setItem(key, JSON.stringify(next));
        else localStorage.removeItem(key);
    } catch (_error) {
    }
    return next;
}

function addStoredGoogleFormLinkLibraryLink(projectId, email, value) {
    const safeUrl = toSafeGoogleFormUrl(value);
    if (!safeUrl) return readStoredGoogleFormLinkLibrary(projectId, email);
    return writeStoredGoogleFormLinkLibrary(projectId, email, [
        { url: safeUrl, savedAt: new Date().toISOString() },
        ...readStoredGoogleFormLinkLibrary(projectId, email)
    ]);
}

function removeStoredGoogleFormLinkLibraryLink(projectId, email, value) {
    const safeUrl = toSafeGoogleFormUrl(value);
    return writeStoredGoogleFormLinkLibrary(
        projectId,
        email,
        readStoredGoogleFormLinkLibrary(projectId, email).filter((item) => item.url !== safeUrl)
    );
}

function normalizeTrelloCardLibrary(values) {
    const seenIndexByUrl = new Map();
    const list = [];
    const source = Array.isArray(values) ? values : [];
    source.forEach((value) => {
        const candidateUrl = typeof value === "object" && value
            ? value.url
            : value;
        const safeUrl = toSafeTrelloCardUrl(candidateUrl);
        if (!safeUrl) {
            return;
        }

        let savedAt = "";
        let favourite = false;
        if (typeof value === "object" && value) {
            const parsed = Date.parse(String(value.savedAt || "").trim());
            savedAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
            favourite = Boolean(value.favourite);
        }

        if (seenIndexByUrl.has(safeUrl)) {
            const existingIndex = Number(seenIndexByUrl.get(safeUrl));
            const existing = list[existingIndex] || { url: safeUrl, savedAt: "", favourite: false };
            list[existingIndex] = {
                url: safeUrl,
                savedAt: existing.savedAt || savedAt,
                favourite: existing.favourite || favourite
            };
            return;
        }

        seenIndexByUrl.set(safeUrl, list.length);
        list.push({ url: safeUrl, savedAt, favourite });
    });

    const trimmed = list.slice(0, 12);
    // Only one entry may be the favourite; keep the first marked one if duplicates slipped through.
    let favouriteClaimed = false;
    return trimmed.map((item) => {
        if (!item.favourite) {
            return item;
        }
        if (favouriteClaimed) {
            return { ...item, favourite: false };
        }
        favouriteClaimed = true;
        return item;
    });
}

function mergeTrelloCardLibrarySources(...sources) {
    const merged = [];
    sources.forEach((source) => {
        const values = Array.isArray(source) ? source : [];
        values.forEach((value) => {
            if (typeof value === "string") {
                merged.push({ url: value, savedAt: "" });
                return;
            }
            merged.push(value);
        });
    });
    return normalizeTrelloCardLibrary(merged);
}

function formatLibrarySavedAtLabel(savedAt) {
    const parsed = Date.parse(String(savedAt || "").trim());
    if (!Number.isFinite(parsed)) {
        return "saved earlier";
    }

    const now = Date.now();
    const diffMs = Math.max(0, now - parsed);
    const minuteMs = 60 * 1000;
    const hourMs = 60 * minuteMs;
    const dayMs = 24 * hourMs;

    if (diffMs < minuteMs) {
        return "saved just now";
    }
    if (diffMs < hourMs) {
        const minutes = Math.round(diffMs / minuteMs);
        return `saved ${minutes} min${minutes === 1 ? "" : "s"} ago`;
    }
    if (diffMs < dayMs) {
        const hours = Math.round(diffMs / hourMs);
        return `saved ${hours} hr${hours === 1 ? "" : "s"} ago`;
    }
    const days = Math.round(diffMs / dayMs);
    return `saved ${days} day${days === 1 ? "" : "s"} ago`;
}

function readStoredTrelloCardLibrary(projectId, email) {
    const storageKey = getTrelloCardLibraryStorageKey(projectId, email);
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return [];
        }
        return normalizeTrelloCardLibrary(JSON.parse(raw));
    } catch (_error) {
        return [];
    }
}

function writeStoredTrelloCardLibrary(projectId, email, values) {
    const storageKey = getTrelloCardLibraryStorageKey(projectId, email);
    let nextValues = normalizeTrelloCardLibrary(values);
    // A student's only saved Trello link becomes their Favourite automatically.
    if (nextValues.length === 1 && !nextValues[0].favourite) {
        nextValues = [{ ...nextValues[0], favourite: true }];
    }
    try {
        if (!nextValues.length) {
            localStorage.removeItem(storageKey);
            return [];
        }
        localStorage.setItem(storageKey, JSON.stringify(nextValues));
    } catch (_error) {
    }
    return nextValues;
}

function addStoredTrelloCardLibraryLink(projectId, email, value) {
    const safeUrl = toSafeTrelloCardUrl(value);
    if (!safeUrl) {
        return readStoredTrelloCardLibrary(projectId, email);
    }

    const current = readStoredTrelloCardLibrary(projectId, email);
    const next = normalizeTrelloCardLibrary([{ url: safeUrl, savedAt: new Date().toISOString() }, ...current]);
    return writeStoredTrelloCardLibrary(projectId, email, next);
}

function removeStoredTrelloCardLibraryLink(projectId, email, value) {
    const safeUrl = toSafeTrelloCardUrl(value);
    if (!safeUrl) {
        return readStoredTrelloCardLibrary(projectId, email);
    }

    const current = readStoredTrelloCardLibrary(projectId, email).filter((item) => toSafeTrelloCardUrl(item?.url || "") !== safeUrl);
    return writeStoredTrelloCardLibrary(projectId, email, current);
}

function getFavouriteTrelloCardLibraryLink(projectId, email) {
    const favourite = readStoredTrelloCardLibrary(projectId, email).find((item) => Boolean(item?.favourite));
    return toSafeTrelloCardUrl(favourite?.url || "");
}

function setFavouriteTrelloCardLibraryLink(projectId, email, value) {
    const safeUrl = toSafeTrelloCardUrl(value);
    if (!safeUrl) {
        return readStoredTrelloCardLibrary(projectId, email);
    }

    const current = readStoredTrelloCardLibrary(projectId, email).map((item) => ({
        ...item,
        favourite: toSafeTrelloCardUrl(item?.url || "") === safeUrl
    }));
    return writeStoredTrelloCardLibrary(projectId, email, current);
}

function normalizeGithubRepoLibrary(values) {
    const seenIndexByUrl = new Map();
    const list = [];
    const source = Array.isArray(values) ? values : [];
    source.forEach((value) => {
        const candidateUrl = typeof value === "object" && value
            ? value.url
            : value;
        const safeUrl = toSafeGithubRepoUrl(candidateUrl);
        if (!safeUrl) {
            return;
        }

        let savedAt = "";
        if (typeof value === "object" && value) {
            const parsed = Date.parse(String(value.savedAt || "").trim());
            savedAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
        }

        if (seenIndexByUrl.has(safeUrl)) {
            const existingIndex = Number(seenIndexByUrl.get(safeUrl));
            const existing = list[existingIndex] || { url: safeUrl, savedAt: "" };
            if (!existing.savedAt && savedAt) {
                list[existingIndex] = { url: safeUrl, savedAt };
            }
            return;
        }

        seenIndexByUrl.set(safeUrl, list.length);
        list.push({ url: safeUrl, savedAt });
    });
    return list.slice(0, 12);
}

function mergeGithubRepoLibrarySources(...sources) {
    const merged = [];
    sources.forEach((source) => {
        const values = Array.isArray(source) ? source : [];
        values.forEach((value) => {
            if (typeof value === "string") {
                merged.push({ url: value, savedAt: "" });
                return;
            }
            merged.push(value);
        });
    });
    return normalizeGithubRepoLibrary(merged);
}

function readStoredGithubRepoLibrary(projectId, email) {
    const storageKey = getGithubRepoLibraryStorageKey(projectId, email);
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return [];
        }
        return normalizeGithubRepoLibrary(JSON.parse(raw));
    } catch (_error) {
        return [];
    }
}

function writeStoredGithubRepoLibrary(projectId, email, values) {
    const storageKey = getGithubRepoLibraryStorageKey(projectId, email);
    const nextValues = normalizeGithubRepoLibrary(values);
    try {
        if (!nextValues.length) {
            localStorage.removeItem(storageKey);
            return [];
        }
        localStorage.setItem(storageKey, JSON.stringify(nextValues));
    } catch (_error) {
    }
    return nextValues;
}

function addStoredGithubRepoLibraryLink(projectId, email, value) {
    const safeUrl = toSafeGithubRepoUrl(value);
    if (!safeUrl) {
        return readStoredGithubRepoLibrary(projectId, email);
    }

    const current = readStoredGithubRepoLibrary(projectId, email);
    const next = normalizeGithubRepoLibrary([{ url: safeUrl, savedAt: new Date().toISOString() }, ...current]);
    return writeStoredGithubRepoLibrary(projectId, email, next);
}

function removeStoredGithubRepoLibraryLink(projectId, email, value) {
    const safeUrl = toSafeGithubRepoUrl(value);
    if (!safeUrl) {
        return readStoredGithubRepoLibrary(projectId, email);
    }

    const current = readStoredGithubRepoLibrary(projectId, email).filter((item) => toSafeGithubRepoUrl(item?.url || "") !== safeUrl);
    return writeStoredGithubRepoLibrary(projectId, email, current);
}

function normalizeOneDriveLinkLibrary(values) {
    const seenIndexByUrl = new Map();
    const list = [];
    const source = Array.isArray(values) ? values : [];
    source.forEach((value) => {
        const candidateUrl = typeof value === "object" && value
            ? value.url
            : value;
        const safeUrl = toSafeOneDriveFolderUrl(candidateUrl);
        if (!safeUrl) {
            return;
        }

        let savedAt = "";
        if (typeof value === "object" && value) {
            const parsed = Date.parse(String(value.savedAt || "").trim());
            savedAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
        }

        if (seenIndexByUrl.has(safeUrl)) {
            const existingIndex = Number(seenIndexByUrl.get(safeUrl));
            const existing = list[existingIndex] || { url: safeUrl, savedAt: "" };
            if (!existing.savedAt && savedAt) {
                list[existingIndex] = { url: safeUrl, savedAt };
            }
            return;
        }

        seenIndexByUrl.set(safeUrl, list.length);
        list.push({ url: safeUrl, savedAt });
    });
    return list.slice(0, 12);
}

function mergeOneDriveLinkLibrarySources(...sources) {
    const merged = [];
    sources.forEach((source) => {
        const values = Array.isArray(source) ? source : [];
        values.forEach((value) => {
            if (typeof value === "string") {
                merged.push({ url: value, savedAt: "" });
                return;
            }
            merged.push(value);
        });
    });
    return normalizeOneDriveLinkLibrary(merged);
}

function readStoredOneDriveLinkLibrary(projectId, email) {
    const storageKey = getOneDriveLinkLibraryStorageKey(projectId, email);
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return [];
        }
        return normalizeOneDriveLinkLibrary(JSON.parse(raw));
    } catch (_error) {
        return [];
    }
}

function writeStoredOneDriveLinkLibrary(projectId, email, values) {
    const storageKey = getOneDriveLinkLibraryStorageKey(projectId, email);
    const nextValues = normalizeOneDriveLinkLibrary(values);
    try {
        if (!nextValues.length) {
            localStorage.removeItem(storageKey);
            return [];
        }
        localStorage.setItem(storageKey, JSON.stringify(nextValues));
    } catch (_error) {
    }
    return nextValues;
}

function addStoredOneDriveLinkLibraryLink(projectId, email, value) {
    const safeUrl = toSafeOneDriveFolderUrl(value);
    if (!safeUrl) {
        return readStoredOneDriveLinkLibrary(projectId, email);
    }

    const current = readStoredOneDriveLinkLibrary(projectId, email);
    const next = normalizeOneDriveLinkLibrary([{ url: safeUrl, savedAt: new Date().toISOString() }, ...current]);
    return writeStoredOneDriveLinkLibrary(projectId, email, next);
}

function removeStoredOneDriveLinkLibraryLink(projectId, email, value) {
    const safeUrl = toSafeOneDriveFolderUrl(value);
    if (!safeUrl) {
        return readStoredOneDriveLinkLibrary(projectId, email);
    }

    const current = readStoredOneDriveLinkLibrary(projectId, email).filter((item) => toSafeOneDriveFolderUrl(item?.url || "") !== safeUrl);
    return writeStoredOneDriveLinkLibrary(projectId, email, current);
}

function getCodeFileLinkLibraryStorageKey(prefix, projectId, email) {
    return `${prefix}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readStoredCodeFileLinkLibrary(prefix, projectId, email) {
    const storageKey = getCodeFileLinkLibraryStorageKey(prefix, projectId, email);
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => ({ url: toSafeExternalUrl(item?.url || ""), savedAt: String(item?.savedAt || "").trim() }))
            .filter((item) => item.url);
    } catch (_error) {
        return [];
    }
}

function writeStoredCodeFileLinkLibrary(prefix, projectId, email, values) {
    const storageKey = getCodeFileLinkLibraryStorageKey(prefix, projectId, email);
    const seen = new Set();
    const deduped = (Array.isArray(values) ? values : []).reduce((accumulator, item) => {
        const url = toSafeExternalUrl(item?.url || "");
        if (!url || seen.has(url)) return accumulator;
        seen.add(url);
        accumulator.push({ url, savedAt: String(item?.savedAt || "").trim() });
        return accumulator;
    }, []);
    try {
        if (!deduped.length) {
            localStorage.removeItem(storageKey);
        } else {
            localStorage.setItem(storageKey, JSON.stringify(deduped));
        }
    } catch (_error) {
    }
    return deduped;
}

function addStoredCodeFileLinkLibraryLink(prefix, projectId, email, value) {
    const safeUrl = toSafeExternalUrl(value);
    if (!safeUrl) {
        return readStoredCodeFileLinkLibrary(prefix, projectId, email);
    }
    const current = readStoredCodeFileLinkLibrary(prefix, projectId, email).filter((item) => item.url !== safeUrl);
    return writeStoredCodeFileLinkLibrary(prefix, projectId, email, [{ url: safeUrl, savedAt: new Date().toISOString() }, ...current]);
}

function removeStoredCodeFileLinkLibraryLink(prefix, projectId, email, value) {
    const safeUrl = toSafeExternalUrl(value);
    if (!safeUrl) {
        return readStoredCodeFileLinkLibrary(prefix, projectId, email);
    }
    const current = readStoredCodeFileLinkLibrary(prefix, projectId, email).filter((item) => item.url !== safeUrl);
    return writeStoredCodeFileLinkLibrary(prefix, projectId, email, current);
}

async function renderUseOfToolsTechniquesPanel(host, projectId, allocation) {
    const slot = host?.querySelector("#use-of-tools-techniques-slot");
    if (!slot) return;

    const digitalMediaType = String(allocation?.digital_media_type || "").trim();
    const projectTaskStandard = String(allocation?.standard_2 || "").match(/\b(91893|91903)\b/)?.[1] || "";
    const labels = projectTaskStandard === "91903"
        ? USE_OF_TOOLS_TECHNIQUES_LABELS_91903
        : USE_OF_TOOLS_TECHNIQUES_LABELS_91893;

    let detected = {};
    try {
        const rows = await fetchMyEvidenceRows(projectId);
        rows.forEach((row) => {
            if (String(row?.standard || "").trim() !== USE_OF_TOOLS_TECHNIQUES_EVIDENCE_STANDARD) return;
            (Array.isArray(row?.steps) ? row.steps : []).forEach((step) => {
                const match = String(step?.text || "").match(/^DIGIMED_TOOLS_TECHNIQUES_ACK\|(.+)\|true$/i);
                if (match?.[1]) detected[match[1].trim()] = true;
            });
        });

        // Ticks made on the Task List may exist only in this browser; back-fill them into the database.
        const email = readStoredHubEmail();
        let localState = {};
        try {
            localState = JSON.parse(localStorage.getItem(`hub_digimed_tools_techniques_v1:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`) || "{}") || {};
        } catch (_error) {
            localState = {};
        }
        const missingInDb = [...USE_OF_TOOLS_TECHNIQUES_LABELS_91893, ...USE_OF_TOOLS_TECHNIQUES_LABELS_91903]
            .filter((label) => localState[label] && !detected[label]);
        if (missingInDb.length) {
            missingInDb.forEach((label) => { detected[label] = true; });
            const steps = Object.keys(detected).map((label) => ({ text: `DIGIMED_TOOLS_TECHNIQUES_ACK|${label}|true`, done: true }));
            const nextRows = rows.filter((row) => String(row?.standard || "").trim() !== USE_OF_TOOLS_TECHNIQUES_EVIDENCE_STANDARD);
            nextRows.push({ standard: USE_OF_TOOLS_TECHNIQUES_EVIDENCE_STANDARD, steps });
            await saveMyEvidenceRows(projectId, nextRows).catch(() => {});
        }
    } catch (_error) {
        detected = {};
    }

    const detectedCount = labels.filter((label) => detected[label]).length;
    const mediaLabel = digitalMediaType ? digitalMediaType.toUpperCase() : "";
    slot.innerHTML = `
        <section class="task-topic-guide-block">
            <h3>Subtasks</h3>
            <p class="task-topic-submission-note"><strong>Project/Task Std:</strong> ${escapeHtml(projectTaskStandard || "Not set")} &nbsp; <strong>Digital Media Type:</strong> ${escapeHtml(mediaLabel || "Not set")}</p>
            <p class="task-topic-submission-note">Tools &amp; Techniques${mediaLabel ? ` (${escapeHtml(mediaLabel)})` : ""}: ${detectedCount} of ${labels.length} detected in your project.</p>
            <ul class="list task-topic-guide-list" style="list-style:none;padding-left:0">
                ${labels.map((label) => `<li><input type="checkbox" tabindex="-1" aria-readonly="true" style="accent-color:#1d4ed8;pointer-events:none;width:1.05rem;height:1.05rem;vertical-align:middle" ${detected[label] ? "checked" : ""}> ${escapeHtml(label)}</li>`).join("")}
            </ul>
            ${projectTaskStandard === "91893" ? `<p class="task-topic-submission-note">Complete any 3 or more categories.</p>` : ""}
            <p class="task-topic-submission-note">Auto-detected from your GitHub repo where possible. Click Sync from GitHub on the Task List to refresh these boxes.</p>
        </section>
    `;
}

function renderCodeValidationSyncPanel(host, projectId, email, kind) {
    const prefix = kind === "html" ? HTML_FILE_LINK_LIBRARY_STORAGE_PREFIX : CSS_FILE_LINK_LIBRARY_STORAGE_PREFIX;
    const slot = host.querySelector(`#task-topic-${kind}-file-sync-slot`);
    if (!slot) return;

    const idPrefix = `code-validation-${kind}`;
    const label = kind === "html" ? "HTML" : "CSS";
    const validatorUrl = kind === "html" ? "https://validator.w3.org/" : "https://jigsaw.w3.org/css-validator/";

    const renderList = () => {
        const items = readStoredCodeFileLinkLibrary(prefix, projectId, email);
        const listEl = slot.querySelector(`#${idPrefix}-link-library-list`);
        const libraryEl = slot.querySelector(`#${idPrefix}-link-library`);
        const countEl = slot.querySelector(`#${idPrefix}-link-library-count`);
        if (!listEl || !libraryEl) return;
        if (!items.length) {
            libraryEl.hidden = true;
            if (countEl) countEl.textContent = "(0)";
            listEl.innerHTML = "";
            return;
        }
        libraryEl.hidden = false;
        if (countEl) countEl.textContent = `(${items.length})`;
        listEl.innerHTML = items.map((item) => `
            <li class="trello-link-library-item" data-code-validation-link-item="${escapeHtml(item.url)}">
                <div class="trello-link-library-link-wrap">
                    <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
                    <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item.savedAt))}</span>
                </div>
                <div class="trello-link-library-actions">
                    <button type="button" class="detail-action detail-action-secondary" data-code-validation-use="${escapeHtml(item.url)}">Use</button>
                    <button type="button" class="detail-action detail-action-secondary" data-code-validation-open="${escapeHtml(item.url)}">Open</button>
                    <button type="button" class="detail-action detail-action-danger" data-code-validation-delete="${escapeHtml(item.url)}">Delete</button>
                </div>
            </li>
        `).join("");
    };

    const initialItems = readStoredCodeFileLinkLibrary(prefix, projectId, email);
    slot.innerHTML = `
        <div class="trello-sync-panel" id="${idPrefix}-sync-panel">
            <h3>${label} File Sync</h3>
            <p>Save the link to the ${label} file you intend to validate at <a href="${escapeHtml(validatorUrl)}" target="_blank" rel="noreferrer">${escapeHtml(validatorUrl)}</a>.</p>
            <label for="${idPrefix}-file-url" class="trello-sync-label">${label} file link</label>
            <input id="${idPrefix}-file-url" class="trello-sync-input" type="url" placeholder="https://... (link to your .${kind} file)" value="${escapeHtml(initialItems[0]?.url || "")}">
            <div class="trello-sync-actions">
                <button type="button" class="detail-action detail-action-secondary" data-code-validation-save>Save ${label} Link</button>
                <button type="button" class="detail-action detail-action-secondary" data-code-validation-openfile>Open ${label} File</button>
            </div>
            <p class="trello-sync-status" id="${idPrefix}-sync-status" aria-live="polite"></p>
            <div class="trello-link-library" id="${idPrefix}-link-library" ${initialItems.length ? "" : "hidden"}>
                <p class="trello-link-library-title">Saved ${label} Links <span class="trello-link-library-count" id="${idPrefix}-link-library-count">(${initialItems.length})</span></p>
                <ul class="trello-link-library-list" id="${idPrefix}-link-library-list"></ul>
            </div>
        </div>
    `;
    renderList();

    const setStatusLocal = (message, isError = false) => {
        const statusEl = slot.querySelector(`#${idPrefix}-sync-status`);
        if (!statusEl) return;
        statusEl.textContent = String(message || "");
        statusEl.classList.toggle("is-error", Boolean(isError));
    };

    slot.addEventListener("click", (event) => {
        const button = event.target?.closest?.("button");
        if (!button) return;

        const input = slot.querySelector(`#${idPrefix}-file-url`);

        if (button.hasAttribute("data-code-validation-save")) {
            const url = toSafeExternalUrl(input?.value || "");
            if (!url) {
                setStatusLocal(`Enter a valid link to your ${label} file first.`, true);
                return;
            }
            addStoredCodeFileLinkLibraryLink(prefix, projectId, email, url);
            renderList();
            setStatusLocal(`${label} file link saved.`);
            return;
        }

        if (button.hasAttribute("data-code-validation-openfile")) {
            const url = toSafeExternalUrl(input?.value || "");
            if (!url) {
                setStatusLocal(`Enter a valid link to your ${label} file first.`, true);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
            return;
        }

        const useUrl = button.getAttribute("data-code-validation-use");
        if (useUrl) {
            const safeUrl = toSafeExternalUrl(useUrl);
            if (safeUrl && input) {
                input.value = safeUrl;
                setStatusLocal("Selected saved link.");
            }
            return;
        }

        const openUrl = button.getAttribute("data-code-validation-open");
        if (openUrl) {
            const safeUrl = toSafeExternalUrl(openUrl);
            if (safeUrl) window.open(safeUrl, "_blank", "noopener,noreferrer");
            return;
        }

        const deleteUrl = button.getAttribute("data-code-validation-delete");
        if (deleteUrl) {
            const safeUrl = toSafeExternalUrl(deleteUrl);
            if (!safeUrl || !window.confirm(`Delete this saved ${label} link?`)) return;
            removeStoredCodeFileLinkLibraryLink(prefix, projectId, email, safeUrl);
            renderList();
            if (input && input.value === safeUrl) input.value = "";
            setStatusLocal(`Removed saved ${label} link.`);
            return;
        }
    });
}

function renderCodeValidationTechnicalHealthTracker(host, repoUrl) {
    const slot = host.querySelector("#task-topic-technical-health-slot");
    const safeRepoUrl = toSafeGithubRepoUrl(repoUrl);
    if (!slot) return;

    if (!safeRepoUrl) {
        slot.innerHTML = `<p class="task-topic-submission-note">Save a public GitHub repository on the Version Control: GitHub page to view automated validation and technical health.</p>`;
        return;
    }

    const render = (repoAnalysis, assetHealth) => {
        const validationRows = Array.isArray(repoAnalysis?.validation) ? repoAnalysis.validation : [];
        const validationSummary = (type) => {
            const rows = validationRows.filter((row) => row.type === type && row.checked);
            return {
                checked: rows.length,
                errors: rows.reduce((total, row) => total + Number(row.errorCount || 0), 0),
                warnings: rows.reduce((total, row) => total + Number(row.warningCount || 0), 0)
            };
        };
        const html = validationSummary("html");
        const css = validationSummary("css");
        const links = assetHealth?.link_details || {};
        const broken = Number(assetHealth?.broken_reference_count || 0);
        slot.innerHTML = `
            <div class="trello-sync-panel">
                <p class="task-topic-submission-note">Repository: <a href="${escapeHtml(safeRepoUrl)}" target="_blank" rel="noreferrer">${escapeHtml(safeRepoUrl)}</a></p>
                <div class="task-topic-guide-block">
                    <h3>HTML</h3>
                    <ul class="list task-topic-guide-list">
                        <li>${html.checked} page${html.checked === 1 ? "" : "s"} checked</li>
                        <li>${html.errors} error${html.errors === 1 ? "" : "s"}</li>
                        <li>${html.warnings} warning${html.warnings === 1 ? "" : "s"}</li>
                    </ul>
                </div>
                <div class="task-topic-guide-block">
                    <h3>CSS</h3>
                    <ul class="list task-topic-guide-list">
                        <li>${css.checked} stylesheet${css.checked === 1 ? "" : "s"} checked</li>
                        <li>${css.errors} error${css.errors === 1 ? "" : "s"}</li>
                        <li>${css.warnings} warning${css.warnings === 1 ? "" : "s"}</li>
                    </ul>
                </div>
                <div class="task-topic-guide-block">
                    <h3>Links</h3>
                    <ul class="list task-topic-guide-list">
                        <li>${Number(links.internal_links || 0)} internal link${Number(links.internal_links || 0) === 1 ? "" : "s"}</li>
                        <li>${Number(links.external_links || 0)} external link${Number(links.external_links || 0) === 1 ? "" : "s"}</li>
                        <li>${broken} broken reference${broken === 1 ? "" : "s"}</li>
                    </ul>
                </div>
                <div class="task-topic-guide-block">
                    <h3>Assets</h3>
                    <ul class="list task-topic-guide-list"><li>${broken} missing asset reference${broken === 1 ? "" : "s"}</li></ul>
                </div>
                <button type="button" class="detail-action detail-action-secondary" id="code-validation-health-refresh">Refresh Technical Health</button>
                <p class="trello-sync-status" id="code-validation-health-status" aria-live="polite"></p>
            </div>
        `;
        slot.querySelector("#code-validation-health-refresh")?.addEventListener("click", () => {
            void load();
        });
    };

    const load = async () => {
        slot.innerHTML = `<p class="task-topic-submission-note">Checking validation and technical health from GitHub...</p>`;
        try {
            const [repoResponse, assetResponse] = await Promise.all([
                fetch(`/api/integrations/github/repo-analysis?repo_url=${encodeURIComponent(safeRepoUrl)}`, { headers: buildWriteHeaders() }),
                fetch(`/api/integrations/github/asset-health?repo_url=${encodeURIComponent(safeRepoUrl)}`, { headers: buildWriteHeaders() })
            ]);
            const [repoAnalysis, assetHealth] = await Promise.all([
                repoResponse.json().catch(() => ({})),
                assetResponse.json().catch(() => ({}))
            ]);
            if (!repoResponse.ok || !assetResponse.ok) {
                throw new Error(repoAnalysis?.error || assetHealth?.error || "Could not load technical health from GitHub.");
            }
            render(repoAnalysis, assetHealth);
        } catch (error) {
            slot.innerHTML = `<p class="task-topic-submission-note is-error">${escapeHtml(error?.message || "Could not load technical health from GitHub.")}</p>`;
        }
    };

    void load();
}

function renderGithubProjectManagementTracker(slot, repoUrl) {
    const safeRepoUrl = toSafeGithubRepoUrl(repoUrl);
    if (!slot) return;

    if (!safeRepoUrl) {
        slot.innerHTML = "";
        return;
    }

    const load = async () => {
        slot.innerHTML = `<p class="trello-sync-status">Loading GitHub tracker...</p>`;
        try {
            const response = await fetch(
                `/api/integrations/github/repo-analysis?repo_url=${encodeURIComponent(safeRepoUrl)}`,
                { headers: buildWriteHeaders() }
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || "Could not load GitHub tracker.");
            }
            const lastCommit = payload?.last_commit || {};
            const lastCommitText = String(lastCommit?.message || "No commit history available.").trim();
            const lastCommitDate = String(lastCommit?.date || "").trim();
            slot.innerHTML = `
                <div class="task-topic-guide-block">
                    <h3>GitHub Tracker</h3>
                    <ul class="list task-topic-guide-list">
                        <li>Commits: ${Number(payload?.commit_count || 0)}</li>
                        <li>Days with development activity: ${Number(payload?.commit_day_count || 0)}</li>
                        <li>Files changed in latest commit: ${Number(payload?.files_changed || 0)}</li>
                        <li>Last commit: ${escapeHtml(lastCommitText)}${lastCommitDate ? ` (${escapeHtml(formatSyncCreatedDate(lastCommitDate))})` : ""}</li>
                        <li>Commit history: ${Number(payload?.commit_count || 0) > 0 ? "available" : "not available"}</li>
                        <li>Branches: ${Number(payload?.branches_count || 0)}</li>
                        <li>Releases/tags: ${Number(payload?.releases_tags_count || 0)}</li>
                    </ul>
                    <button type="button" class="detail-action detail-action-secondary" id="github-tracker-refresh">Refresh GitHub Tracker</button>
                </div>
            `;
            slot.querySelector("#github-tracker-refresh")?.addEventListener("click", () => {
                void load();
            });
        } catch (error) {
            slot.innerHTML = `<p class="trello-sync-status is-error">${escapeHtml(error?.message || "Could not load GitHub tracker.")}</p>`;
        }
    };

    void load();
}

function normalizeGoogleDriveLinkLibrary(values) {
    const seenIndexByUrl = new Map();
    const list = [];
    const source = Array.isArray(values) ? values : [];
    source.forEach((value) => {
        const candidateUrl = typeof value === "object" && value
            ? value.url
            : value;
        const safeUrl = toSafeGoogleDriveFolderUrl(candidateUrl);
        if (!safeUrl) {
            return;
        }

        let savedAt = "";
        if (typeof value === "object" && value) {
            const parsed = Date.parse(String(value.savedAt || "").trim());
            savedAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
        }

        if (seenIndexByUrl.has(safeUrl)) {
            const existingIndex = Number(seenIndexByUrl.get(safeUrl));
            const existing = list[existingIndex] || { url: safeUrl, savedAt: "" };
            if (!existing.savedAt && savedAt) {
                list[existingIndex] = { url: safeUrl, savedAt };
            }
            return;
        }

        seenIndexByUrl.set(safeUrl, list.length);
        list.push({ url: safeUrl, savedAt });
    });
    return list.slice(0, 12);
}

function mergeGoogleDriveLinkLibrarySources(...sources) {
    const merged = [];
    sources.forEach((source) => {
        const values = Array.isArray(source) ? source : [];
        values.forEach((value) => {
            if (typeof value === "string") {
                merged.push({ url: value, savedAt: "" });
                return;
            }
            merged.push(value);
        });
    });
    return normalizeGoogleDriveLinkLibrary(merged);
}

function readStoredGoogleDriveLinkLibrary(projectId, email) {
    const storageKey = getGoogleDriveLinkLibraryStorageKey(projectId, email);
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) {
            return [];
        }
        return normalizeGoogleDriveLinkLibrary(JSON.parse(raw));
    } catch (_error) {
        return [];
    }
}

function writeStoredGoogleDriveLinkLibrary(projectId, email, values) {
    const storageKey = getGoogleDriveLinkLibraryStorageKey(projectId, email);
    const nextValues = normalizeGoogleDriveLinkLibrary(values);
    try {
        if (!nextValues.length) {
            localStorage.removeItem(storageKey);
            return [];
        }
        localStorage.setItem(storageKey, JSON.stringify(nextValues));
    } catch (_error) {
    }
    return nextValues;
}

function addStoredGoogleDriveLinkLibraryLink(projectId, email, value) {
    const safeUrl = toSafeGoogleDriveFolderUrl(value);
    if (!safeUrl) {
        return readStoredGoogleDriveLinkLibrary(projectId, email);
    }

    const current = readStoredGoogleDriveLinkLibrary(projectId, email);
    const next = normalizeGoogleDriveLinkLibrary([{ url: safeUrl, savedAt: new Date().toISOString() }, ...current]);
    return writeStoredGoogleDriveLinkLibrary(projectId, email, next);
}

function removeStoredGoogleDriveLinkLibraryLink(projectId, email, value) {
    const safeUrl = toSafeGoogleDriveFolderUrl(value);
    if (!safeUrl) {
        return readStoredGoogleDriveLinkLibrary(projectId, email);
    }

    const current = readStoredGoogleDriveLinkLibrary(projectId, email).filter((item) => toSafeGoogleDriveFolderUrl(item?.url || "") !== safeUrl);
    return writeStoredGoogleDriveLinkLibrary(projectId, email, current);
}

function readStoredTrelloCardLink(projectId, email) {
    const storageKey = getTrelloCardStorageKey(projectId, email);
    try {
        return String(localStorage.getItem(storageKey) || "").trim();
    } catch (_error) {
        return "";
    }
}

function writeStoredTrelloCardLink(projectId, email, value) {
    const storageKey = getTrelloCardStorageKey(projectId, email);
    const nextValue = String(value || "").trim();
    try {
        if (!nextValue) {
            localStorage.removeItem(storageKey);
            return;
        }
        localStorage.setItem(storageKey, nextValue);
    } catch (_error) {
    }
}

function toSafeTrelloCardUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const trelloBoardAliases = new Map([
        ["n06v7lY2", "n06w7IY2"]
    ]);

    try {
        const parsed = new URL(raw);
        const host = String(parsed.hostname || "").toLowerCase();
        if (!(host === "trello.com" || host.endsWith(".trello.com"))) {
            return "";
        }

        // Accept card URLs: /c/xxxx
        const cardMatch = parsed.pathname.match(/\/c\/([a-zA-Z0-9]+)/i);
        if (cardMatch?.[1]) {
            return `https://trello.com/c/${cardMatch[1]}`;
        }

        // Also accept board URLs: /b/xxxx/board-name — store the canonical board URL
        const boardMatch = parsed.pathname.match(/\/b\/([a-zA-Z0-9]+)/i);
        if (boardMatch?.[1]) {
            const boardId = trelloBoardAliases.get(boardMatch[1]) || boardMatch[1];
            const boardSlug = parsed.pathname.split("/").filter(Boolean).slice(2).join("/");
            return boardSlug
                ? `https://trello.com/b/${boardId}/${boardSlug}`
                : `https://trello.com/b/${boardId}`;
        }

        return "";
    } catch (_error) {
        return "";
    }
}

function extractTrelloBoardIdFromUrl(value) {
    const safeUrl = toSafeTrelloCardUrl(value);
    const boardMatch = String(safeUrl || "").match(/\/b\/([a-zA-Z0-9]+)/i);
    return boardMatch?.[1] || "";
}

// Decomposition subtask categories from the Task List, matched against Trello card names/labels.
const DECOMPOSITION_TASK_CATEGORIES = [
    {
        label: "Development Steps",
        pattern: /develop|build|implement|code|coding|program|script|create|add|feature|functionality|page|layout|design|html|css|javascript|step/i
    },
    {
        label: "Tools & Techniques",
        // The "(Intend to Use|Currently Using|Have Used)" suffix is written by the Tools & Techniques
        // page's Push to Trello button — it identifies these cards regardless of the tool's own name.
        pattern: /tool|technique|software|library|framework|template|api|plugin|extension|github|trello|onedrive|google drive|vs code|setup|set up|install|sync|version control|\((?:intend to use|currently using|have used)\)/i
    },
    {
        label: "Trialling",
        pattern: /trial|trialling|trialing|prototype|experiment|iterat|mock.?up|wireframe|draft/i
    },
    {
        label: "Testing",
        pattern: /test|testing|debug|bug|verify|validat|check|fix/i
    },
    {
        label: "Success Criteria",
        pattern: /success|criteria|evaluat|measure|review|quality|requirement|spec|acceptance/i
    },
    {
        label: "Client Interaction",
        pattern: /client|stakeholder|end.?user|feedback|meeting|interview|survey|consult|brief|present|sign.?off|approval/i
    }
];

// Session-cached fetch of the growing, student-worded Tools & Techniques keyword index (server-managed,
// grows automatically as students push tool names to Trello). Used to recognise cards typed directly into
// Trello that don't match the hub's own hardcoded keyword patterns.
let decompToolsTechniquesKeywordsCache = null;
async function fetchToolsTechniquesKeywords() {
    if (decompToolsTechniquesKeywordsCache) return decompToolsTechniquesKeywordsCache;
    try {
        const response = await fetch("/api/tools-techniques-keywords", { headers: buildWriteHeaders() });
        const payload = await response.json().catch(() => ({}));
        const rows = response.ok && Array.isArray(payload?.keywords) ? payload.keywords : [];
        decompToolsTechniquesKeywordsCache = rows.map((row) => String(row?.keyword || "").trim().toLowerCase()).filter(Boolean);
    } catch (_error) {
        decompToolsTechniquesKeywordsCache = [];
    }
    return decompToolsTechniquesKeywordsCache;
}

function countDecompositionTaskCategories(cards, toolsTechniquesKeywords = []) {
    const safeCards = Array.isArray(cards) ? cards : [];
    const haystacks = safeCards.map((card) => {
        const labels = Array.isArray(card?.labels)
            ? card.labels.map((label) => String(label?.name || label || "")).join(" ")
            : "";
        return `${String(card?.name || "")} ${labels}`.trim();
    }).filter(Boolean);
    const keywordsLower = Array.isArray(toolsTechniquesKeywords) ? toolsTechniquesKeywords : [];

    return DECOMPOSITION_TASK_CATEGORIES.map((category) => ({
        label: category.label,
        count: haystacks.filter((text) => {
            if (category.pattern.test(text)) return true;
            if (category.label === "Tools & Techniques" && keywordsLower.length) {
                const lowerText = text.toLowerCase();
                return keywordsLower.some((keyword) => keyword && lowerText.includes(keyword));
            }
            return false;
        }).length
    }));
}

const DECOMPOSITION_TRELLO_SYNC_STORAGE_PREFIX = "hub_decomp_trello_last_sync_v1";
const DECOMPOSITION_CATEGORY_COVERAGE_STORAGE_PREFIX = "hub_decomp_category_coverage_v1";

// Shared with the Task List page so it can show which decomposition categories still have no Trello tasks.
function writeDecompositionCategoryCoverage(projectId, email, rows) {
    try {
        localStorage.setItem(
            `${DECOMPOSITION_CATEGORY_COVERAGE_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`,
            JSON.stringify({ savedAt: new Date().toISOString(), categories: Array.isArray(rows) ? rows : [] })
        );
    } catch (_error) {
    }
}

async function saveDecompositionCategoryCoverage(projectId, rows, trelloTaskCount) {
    try {
        await fetch("/api/students/decomposition-coverage", {
            method: "POST",
            headers: buildWriteHeaders(),
            body: JSON.stringify({
                activity_id: String(projectId || "").trim(),
                categories: Array.isArray(rows) ? rows : [],
                trello_task_count: Number(trelloTaskCount || 0)
            })
        });
    } catch (_error) {
    }
}

function getDecompositionTrelloSyncStorageKey(projectId, email) {
    return `${DECOMPOSITION_TRELLO_SYNC_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function readDecompositionTrelloSyncTime(projectId, email) {
    try {
        return String(localStorage.getItem(getDecompositionTrelloSyncStorageKey(projectId, email)) || "").trim();
    } catch (_error) {
        return "";
    }
}

function writeDecompositionTrelloSyncTime(projectId, email, isoValue) {
    try {
        localStorage.setItem(getDecompositionTrelloSyncStorageKey(projectId, email), String(isoValue || ""));
    } catch (_error) {
    }
}

function buildTrelloPdfFileName(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `Trello - ${year}-${month}-${day}.pdf`;
}

// jsPDF is loaded on demand so the task-topic pages do not carry it on every visit.
function loadJsPdfLibrary() {
    if (window.jspdf?.jsPDF) {
        return Promise.resolve(window.jspdf.jsPDF);
    }

    return new Promise((resolve, reject) => {
        const existing = document.querySelector("script[data-jspdf-loader]");
        const onLoaded = () => {
            if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
            else reject(new Error("PDF library did not load correctly."));
        };

        if (existing) {
            existing.addEventListener("load", onLoaded, { once: true });
            existing.addEventListener("error", () => reject(new Error("PDF library could not be downloaded.")), { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.async = true;
        script.setAttribute("data-jspdf-loader", "true");
        script.addEventListener("load", onLoaded, { once: true });
        script.addEventListener("error", () => reject(new Error("PDF library could not be downloaded.")), { once: true });
        document.head.appendChild(script);
    });
}

async function buildDecompositionTrelloPdfBase64(details) {
    const JsPdf = await loadJsPdfLibrary();
    const doc = new JsPdf({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 48;
    let cursorY = 56;

    const nextPageIfNeeded = (needed = 18) => {
        if (cursorY + needed > pageHeight - 48) {
            doc.addPage();
            cursorY = 56;
        }
    };

    const writeLine = (text, { size = 11, style = "normal", gap = 16, color = [23, 69, 111] } = {}) => {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(String(text || ""), pageWidth - marginX * 2);
        lines.forEach((line) => {
            nextPageIfNeeded(gap);
            doc.text(line, marginX, cursorY);
            cursorY += gap;
        });
    };

    writeLine("Decomposition Tasks - Trello Sync", { size: 18, style: "bold", gap: 24 });
    writeLine(String(details?.projectTitle || "Project"), { size: 12, style: "bold", gap: 18 });
    writeLine(`Student: ${details?.email || "Unknown"}`, { size: 10, gap: 14, color: [74, 107, 138] });
    writeLine(`Generated: ${details?.generatedLabel || ""}`, { size: 10, gap: 14, color: [74, 107, 138] });
    writeLine(`Last synced: ${details?.lastSyncedLabel || "not yet"}`, { size: 10, gap: 20, color: [74, 107, 138] });

    writeLine("Task Category Coverage", { size: 13, style: "bold", gap: 20 });
    (Array.isArray(details?.categories) ? details.categories : []).forEach((row) => {
        writeLine(`${row.label}: ${row.count}`, { size: 11, gap: 16 });
    });
    cursorY += 6;

    writeLine("Saved Trello Links", { size: 13, style: "bold", gap: 20 });
    const links = Array.isArray(details?.links) ? details.links : [];
    if (!links.length) {
        writeLine("No saved Trello links.", { size: 11, gap: 16, color: [74, 107, 138] });
    } else {
        links.forEach((link) => {
            writeLine(`${link.favourite ? "* " : "- "}${link.url}`, { size: 10, gap: 14 });
        });
    }
    cursorY += 6;

    writeLine("Decomposition Task Board", { size: 13, style: "bold", gap: 20 });
    (Array.isArray(details?.columns) ? details.columns : []).forEach((column) => {
        writeLine(`${column.title} (${column.cards.length})`, { size: 12, style: "bold", gap: 18 });
        if (!column.cards.length) {
            writeLine("No tasks in this list.", { size: 10, gap: 14, color: [74, 107, 138] });
        } else {
            column.cards.forEach((card) => {
                writeLine(`- ${card}`, { size: 10, gap: 14 });
            });
        }
        cursorY += 4;
    });

    const dataUri = doc.output("datauristring");
    return String(dataUri).split(",")[1] || "";
}

// Lets a student connect their Trello account inline (task-topic pages) without navigating to User Profile.
async function openInlineTrelloConnectPopup() {
    // Open the popup synchronously (within the click gesture) first, otherwise browsers silently
    // block it once we `await` a fetch before calling window.open.
    const popupRef = window.open("", "dtech_hub_trello_connect", "width=650,height=760");
    if (!popupRef) {
        throw new Error("Popup blocked. Please allow popups and try again.");
    }

    let config = null;
    try {
        const configResponse = await fetch("/api/integrations/trello/config", { headers: buildWriteHeaders() });
        config = await configResponse.json().catch(() => ({}));
    } catch (_error) {
        popupRef.close();
        throw new Error("Could not reach the server to start Trello connection.");
    }

    if (!config?.enabled || !config?.api_key) {
        popupRef.close();
        throw new Error("Trello integration is not configured on the server yet.");
    }

    const returnUrl = `${window.location.origin}/trello-callback.html`;
    const authorizeUrl = new URL("https://trello.com/1/authorize");
    authorizeUrl.searchParams.set("expiration", "never");
    authorizeUrl.searchParams.set("name", "DTECH-HUB");
    authorizeUrl.searchParams.set("scope", "read,write");
    authorizeUrl.searchParams.set("response_type", "token");
    authorizeUrl.searchParams.set("key", String(config.api_key));
    authorizeUrl.searchParams.set("return_url", returnUrl);

    return new Promise((resolve, reject) => {
        let finished = false;
        let timeoutHandle = null;
        let closePollHandle = null;

        const finish = (error, token) => {
            if (finished) return;
            finished = true;
            window.removeEventListener("message", onMessage);
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (closePollHandle) clearInterval(closePollHandle);
            if (error) {
                reject(error);
                return;
            }
            resolve(String(token || ""));
        };

        const onMessage = (event) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data || {};
            if (data.source !== "dtech-hub-trello" || !data.token) return;
            finish(null, data.token);
        };

        window.addEventListener("message", onMessage);
        try {
            popupRef.location.href = authorizeUrl.toString();
        } catch (_error) {
            finish(new Error("Could not open the Trello authorization page. Please allow popups and try again."));
            return;
        }

        timeoutHandle = setTimeout(() => {
            finish(new Error("Trello authorization timed out. Please try again."));
        }, 120000);

        closePollHandle = setInterval(() => {
            if (finished) return;
            if (popupRef && popupRef.closed) {
                finish(new Error("Trello authorization was cancelled."));
            }
        }, 350);
    });
}

function getTrelloBoardHint(value) {
    const safeUrl = toSafeTrelloCardUrl(value);
    const boardMatch = String(safeUrl || "").match(/\/b\/([a-zA-Z0-9]+)(?:\/([^/?#]+))?/i);
    if (!boardMatch?.[1]) {
        return "";
    }

    const boardSlug = String(boardMatch[2] || "").replace(/-/g, " ").trim();
    if (boardSlug) {
        return `${boardSlug.charAt(0).toUpperCase()}${boardSlug.slice(1)}`;
    }

    return "Trello board";
}

function toStandardCode(value) {
    const match = String(value || "").match(/\b\d{5}\b/);
    return match ? match[0] : "";
}

function deriveEvidenceStandardsFromDetailData(detailData) {
    return coerceArray(detailData?.standardDetails)
        .map((line) => {
            const match = String(line || "").match(/\b(\d{5})\b/);
            return match ? match[1] : "";
        })
        .filter((code) => code && EVIDENCE_STEPS_TARGET_STANDARDS.has(code));
}

function getEffectiveAssignedStandards(record, detailData) {
    const fromRecord = [
        toStandardCode(record?.standard_1),
        toStandardCode(record?.standard_2)
    ].filter((code) => code && EVIDENCE_STEPS_TARGET_STANDARDS.has(code));
    if (fromRecord.length) {
        return fromRecord;
    }
    return deriveEvidenceStandardsFromDetailData(detailData);
}

function normalizeEvidenceSteps(rows) {
    const source = Array.isArray(rows) ? rows : [];
    return source
        .map((row) => {
            const standard = String(row?.standard || "").trim();
            if (!standard) return null;

            const steps = Array.isArray(row?.steps)
                ? row.steps
                    .map((step) => ({
                        text: String(step?.text || "").trim(),
                        done: Boolean(step?.done)
                    }))
                    .filter((step) => step.text)
                : [];

            return { standard, steps };
        })
        .filter(Boolean);
}

function evidenceRowsToMap(rows) {
    const map = {};
    normalizeEvidenceSteps(rows).forEach((row) => {
        map[row.standard] = row.steps.map((step) => ({ text: step.text, done: Boolean(step.done) }));
    });
    return map;
}

function evidenceMapToRows(state, standards) {
    return normalizeEvidenceSteps(
        (Array.isArray(standards) ? standards : []).map((standard) => ({
            standard,
            steps: Array.isArray(state?.[standard]) ? state[standard] : []
        }))
    );
}

function normalizeRequirementText(value) {
    return String(value || "")
        .replace(/^(Achieved|Merit|Excellence)\s*:\s*/i, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function inferConnectedSystemsFromEvidenceRows(rows) {
    const normalizedRows = normalizeEvidenceSteps(rows);
    let trelloConnected = false;
    let githubConnected = false;

    normalizedRows.forEach((row) => {
        (Array.isArray(row?.steps) ? row.steps : []).forEach((step) => {
            const text = String(step?.text || "").trim();
            if (!text) {
                return;
            }

            const textLower = text.toLowerCase();
            if (text.startsWith("TRELLO_CARD_URL|")) {
                const trelloUrl = toSafeTrelloCardUrl(text.slice("TRELLO_CARD_URL|".length).trim());
                if (trelloUrl) {
                    trelloConnected = true;
                }
            }

            if (textLower.includes("trello.com/")) {
                trelloConnected = true;
            }

            if (/(github\.com|gist\.github\.com|raw\.githubusercontent\.com)/i.test(textLower)) {
                githubConnected = true;
            }
        });
    });

    return { trelloConnected, githubConnected };
}

function getEvidenceCompletionPercentFromRows(rows, standards) {
    const map = evidenceRowsToMap(rows);
    const targetStandards = Array.isArray(standards) ? standards : [];

    if (targetStandards.includes("91897")) {
        const defaults91897 = (Array.isArray(EVIDENCE_STEPS_DEFAULTS?.["91897"]) ? EVIDENCE_STEPS_DEFAULTS["91897"] : [])
            .map((line) => String(line || "").trim())
            .filter((line) => /^achieved\s*:/i.test(line));
        const requiredKeys = defaults91897.map((line) => normalizeRequirementText(line));

        if (requiredKeys.length) {
            const requiredStatus = new Map(requiredKeys.map((key) => [key, false]));
            const items91897 = Array.isArray(map["91897"]) ? map["91897"] : [];

            items91897.forEach((item) => {
                const text = String(item?.text || "").trim();
                if (!text || !/^achieved\s*:/i.test(text)) {
                    return;
                }

                const key = normalizeRequirementText(text);
                if (!requiredStatus.has(key)) {
                    return;
                }

                if (Boolean(item?.done)) {
                    requiredStatus.set(key, true);
                }
            });

            const projectManagementKey = normalizeRequirementText("Achieved: Use appropriate project management tools and techniques to plan the development of a digital technologies outcome.");
            if (requiredStatus.has(projectManagementKey)) {
                const systems = inferConnectedSystemsFromEvidenceRows(rows);
                if (systems.trelloConnected || systems.githubConnected) {
                    requiredStatus.set(projectManagementKey, true);
                }
            }

            const totalRequired = requiredStatus.size;
            const doneRequired = Array.from(requiredStatus.values()).filter(Boolean).length;
            return totalRequired ? Math.round((doneRequired / totalRequired) * 100) : 0;
        }
    }

    let total = 0;
    let done = 0;

    targetStandards.forEach((standard) => {
        const items = Array.isArray(map[standard]) ? map[standard] : [];
        items.forEach((item) => {
            if (!String(item?.text || "").trim()) {
                return;
            }
            total += 1;
            if (Boolean(item?.done)) {
                done += 1;
            }
        });
    });

    if (!total) {
        return 0;
    }

    return Math.round((done / total) * 100);
}

async function fetchEvidenceRows(projectId, studentEmail) {
    const endpoint = `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/evidence`;
    const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/evidence`, {
        headers: buildWriteHeaders()
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.error || "Could not load evidence steps.");
        error.status = Number(response.status || 0);
        error.endpoint = endpoint;
        error.stage = "load-evidence";
        throw error;
    }

    const payload = await response.json().catch(() => ({}));
    return normalizeEvidenceSteps(payload?.evidence_steps);
}

async function saveEvidenceRows(projectId, studentEmail, rows) {
    const endpoint = `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/evidence`;
    const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/evidence`, {
        method: "PATCH",
        headers: buildWriteHeaders(),
        body: JSON.stringify({ evidence_steps: normalizeEvidenceSteps(rows) })
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.error || "Could not save evidence steps.");
        error.status = Number(response.status || 0);
        error.endpoint = endpoint;
        error.stage = "save-evidence";
        throw error;
    }
}

async function persistDigiMedLocalState(projectId, studentEmail, stateKind, state) {
    const safeProjectId = String(projectId || "").trim();
    const safeEmail = String(studentEmail || "").trim().toLowerCase();
    const safeKind = String(stateKind || "").trim().toLowerCase();
    if (!safeProjectId || !safeEmail || !safeKind) return;

    try {
        const rows = await fetchEvidenceRowsEnsuringAllocation(safeProjectId, safeEmail);
        const standard = `digimed-local-state:${safeKind}`;
        const nextRows = rows.filter((row) => String(row?.standard || "").trim() !== standard);
        const steps = Object.entries(state || {})
            .filter(([, done]) => Boolean(done))
            .map(([label]) => ({ text: `DIGIMED_STATE|${safeKind}|${label}|true`, done: true }));
        if (steps.length) nextRows.push({ standard, steps });
        await saveEvidenceRows(safeProjectId, safeEmail, nextRows);
    } catch (_error) {
    }
}

async function fetchMyEvidenceRows(projectId) {
    const endpoint = `/api/activities/${encodeURIComponent(projectId)}/my-evidence`;
    const response = await fetch(endpoint, {
        headers: buildWriteHeaders()
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.error || "Could not load my evidence steps.");
        error.status = Number(response.status || 0);
        error.endpoint = endpoint;
        error.stage = "load-my-evidence";
        throw error;
    }

    const payload = await response.json().catch(() => ({}));
    return normalizeEvidenceSteps(payload?.evidence_steps);
}

async function saveMyEvidenceRows(projectId, rows) {
    const endpoint = `/api/activities/${encodeURIComponent(projectId)}/my-evidence`;
    const response = await fetch(endpoint, {
        method: "PATCH",
        headers: buildWriteHeaders(),
        body: JSON.stringify({ evidence_steps: normalizeEvidenceSteps(rows) })
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.error || "Could not save my evidence steps.");
        error.status = Number(response.status || 0);
        error.endpoint = endpoint;
        error.stage = "save-my-evidence";
        throw error;
    }
}

async function fetchMyToolsTechniques(projectId) {
    const endpoint = `/api/activities/${encodeURIComponent(projectId)}/my-tools-techniques`;
    const response = await fetch(endpoint, {
        headers: buildWriteHeaders()
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.error || "Could not load my tools & techniques.");
        error.status = Number(response.status || 0);
        error.endpoint = endpoint;
        error.stage = "load-my-tools-techniques";
        throw error;
    }

    const payload = await response.json().catch(() => ({}));
    return Array.isArray(payload?.tools_techniques) ? payload.tools_techniques : [];
}

async function saveMyToolsTechniques(projectId, toolsTechniques) {
    const endpoint = `/api/activities/${encodeURIComponent(projectId)}/my-tools-techniques`;
    const response = await fetch(endpoint, {
        method: "PATCH",
        headers: buildWriteHeaders(),
        body: JSON.stringify({ tools_techniques: toolsTechniques })
    });

    if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.error || "Could not save my tools & techniques.");
        error.status = Number(response.status || 0);
        error.endpoint = endpoint;
        error.stage = "save-my-tools-techniques";
        throw error;
    }
}

function getSuggestedToolsForContext(detailData, taskTopic) {
    const contextSignals = [
        String(detailData?.subjectStream || detailData?.subject_stream || detailData?.subject || ""),
        String(detailData?.type || ""),
        String(detailData?.title || ""),
        taskTopic
    ].join(" ").toLowerCase();

    const isProgram = /programm|coding|comput|software|python|javascript|java|react|node/i.test(contextSignals);
    const isWeb = /web|html|css|frontend|ui|ux/i.test(contextSignals);
    const isDesign = /design|ui|ux|graphic|visual|figma|adobe/i.test(contextSignals);
    const isDigitalMedia = /digital\s*media|media|film|video|audio|music|photograph|animation|graphic/i.test(contextSignals);
    const isData = /data|analytics|excel|sql|statistics|business/i.test(contextSignals);

    if (isProgram) return SUGGESTED_TOOLS_BY_CONTEXT.programming;
    if (isWeb) return SUGGESTED_TOOLS_BY_CONTEXT.web;
    if (isDesign) return SUGGESTED_TOOLS_BY_CONTEXT.design;
    if (isDigitalMedia) return SUGGESTED_TOOLS_BY_CONTEXT["digital-media"];
    if (isData) return SUGGESTED_TOOLS_BY_CONTEXT.data;
    return SUGGESTED_TOOLS_BY_CONTEXT.general;
}

async function fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail) {
    try {
        return await fetchEvidenceRows(projectId, studentEmail);
    } catch (error) {
        const status = Number(error?.status || 0);
        if (status !== 404) {
            throw error;
        }
    }

    const toggleInterest = async () => {
        const endpoint = `/api/activities/${encodeURIComponent(projectId)}/interest`;
        const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/interest`, {
            method: "POST",
            headers: buildWriteHeaders()
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const error = new Error(payload?.error || "Could not prepare student allocation.");
            error.status = Number(response.status || 0);
            error.endpoint = endpoint;
            error.stage = "ensure-allocation";
            throw error;
        }

        return response.json().catch(() => ({}));
    };

    const firstResult = await toggleInterest();
    if (!Boolean(firstResult?.interested)) {
        const secondResult = await toggleInterest();
        if (!Boolean(secondResult?.interested)) {
            throw new Error("Could not prepare student allocation.");
        }
    }

    return fetchEvidenceRows(projectId, studentEmail);
}

function buildTaskTopicSubmissionStandardKey(taskTopicTitle, standardNumber = "") {
    const topicSlug = normalizeTaskTopicText(taskTopicTitle)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const standardSlug = String(standardNumber || "task-topic")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return `task-topic:${standardSlug || "task-topic"}:${topicSlug || "topic"}`;
}

function parseTaskTopicSubmissionFromEvidenceRows(rows, standardKey) {
    const normalizedRows = normalizeEvidenceSteps(rows);
    const source = normalizedRows.find((row) => String(row?.standard || "").trim() === standardKey);
    const result = {
        writtenEvidence: "",
        evidenceLink: "",
        fileName: "",
        fileUrl: "",
        haparaAcknowledged: false,
        haparaSubmittedAt: "",
        haparaLocation: "",
        haparaDriveClassUrl: "",
        haparaDocumentRef: "",
        trelloCardUrl: "",
        trelloLastLogDate: "",
        trelloLastLogAt: "",
        trelloLastLogNote: "",
        googleSlidesUrl: "",
        googleFormUrl: "",
        conventionAcknowledgements: {},
        conventionsLastSyncAt: "",
        mediaAssetFolderUrl: "",
        googleDriveProjectFolderUrl: "",
        mediaReviewUrl: "",
        mediaVersionLogDate: "",
        mediaVersionLogAt: "",
        mediaVersionLogNote: "",
        decompositionSteps: [],
        decompositionLastPushAt: "",
        decompositionLastPushCount: 0,
        submittedAt: "",
        reviewStatus: "pending"
    };

    if (!source || !Array.isArray(source.steps)) {
        return result;
    }

    source.steps.forEach((step) => {
        const text = String(step?.text || "").trim();
        if (!text) {
            return;
        }

        if (text.startsWith("WRITTEN|")) {
            result.writtenEvidence = text.slice("WRITTEN|".length).trim();
            return;
        }

        if (text.startsWith("LINK|")) {
            result.evidenceLink = text.slice("LINK|".length).trim();
            if (!result.googleSlidesUrl && /docs\.google\.com\/presentation/i.test(result.evidenceLink)) {
                result.googleSlidesUrl = toSafeExternalUrl(result.evidenceLink);
            }
            return;
        }

        if (text.startsWith("FILE|")) {
            result.fileName = text.slice("FILE|".length).trim();
            return;
        }

        if (text.startsWith("FILE_URL|")) {
            result.fileUrl = text.slice("FILE_URL|".length).trim();
            return;
        }

        if (text.startsWith("HAPARA_ACK|")) {
            const value = text.slice("HAPARA_ACK|".length).trim().toLowerCase();
            result.haparaAcknowledged = value === "true" || value === "1" || value === "yes";
            return;
        }

        if (text.startsWith("HAPARA_SUBMITTED_AT|")) {
            result.haparaSubmittedAt = text.slice("HAPARA_SUBMITTED_AT|".length).trim();
            return;
        }

        if (text.startsWith("HAPARA_LOCATION|")) {
            result.haparaLocation = text.slice("HAPARA_LOCATION|".length).trim();
            return;
        }

        if (text.startsWith("HAPARA_CLASS_DRIVE|")) {
            result.haparaDriveClassUrl = text.slice("HAPARA_CLASS_DRIVE|".length).trim();
            return;
        }

        if (text.startsWith("HAPARA_DOC_REF|")) {
            result.haparaDocumentRef = text.slice("HAPARA_DOC_REF|".length).trim();
            return;
        }

        if (text.startsWith("TRELLO_CARD_URL|")) {
            result.trelloCardUrl = toSafeTrelloCardUrl(text.slice("TRELLO_CARD_URL|".length).trim());
            return;
        }

        if (text.startsWith("TRELLO_LAST_LOG_DATE|")) {
            result.trelloLastLogDate = text.slice("TRELLO_LAST_LOG_DATE|".length).trim();
            return;
        }

        if (text.startsWith("TRELLO_LAST_LOG_AT|")) {
            result.trelloLastLogAt = text.slice("TRELLO_LAST_LOG_AT|".length).trim();
            return;
        }

        if (text.startsWith("TRELLO_LAST_LOG_NOTE|")) {
            result.trelloLastLogNote = text.slice("TRELLO_LAST_LOG_NOTE|".length).trim();
            return;
        }

        if (text.startsWith("GOOGLE_SLIDES_URL|")) {
            result.googleSlidesUrl = toSafeExternalUrl(text.slice("GOOGLE_SLIDES_URL|".length).trim());
            return;
        }

        if (text.startsWith("GOOGLE_FORM_URL|")) {
            result.googleFormUrl = toSafeGoogleFormUrl(text.slice("GOOGLE_FORM_URL|".length).trim());
            return;
        }

        if (text.startsWith("CONVENTION_ACK|")) {
            const [, area, value] = text.split("|");
            if (area && value) result.conventionAcknowledgements[area.trim()] = value.trim().toLowerCase() === "true";
            return;
        }

        if (text.startsWith("CONVENTIONS_LAST_SYNC|")) {
            result.conventionsLastSyncAt = text.slice("CONVENTIONS_LAST_SYNC|".length).trim();
            return;
        }

        if (text.startsWith("MEDIA_ASSET_FOLDER_URL|")) {
            result.mediaAssetFolderUrl = toSafeExternalUrl(text.slice("MEDIA_ASSET_FOLDER_URL|".length).trim());
            return;
        }

        if (text.startsWith("ONEDRIVE_PROJECT_FOLDER_URL|")) {
            result.mediaAssetFolderUrl = toSafeExternalUrl(text.slice("ONEDRIVE_PROJECT_FOLDER_URL|".length).trim());
            return;
        }

        if (text.startsWith("GOOGLE_DRIVE_PROJECT_FOLDER_URL|")) {
            result.googleDriveProjectFolderUrl = toSafeExternalUrl(text.slice("GOOGLE_DRIVE_PROJECT_FOLDER_URL|".length).trim());
            return;
        }

        if (text.startsWith("MEDIA_REVIEW_URL|")) {
            result.mediaReviewUrl = toSafeExternalUrl(text.slice("MEDIA_REVIEW_URL|".length).trim());
            return;
        }

        if (text.startsWith("MEDIA_VERSION_LOG_DATE|")) {
            result.mediaVersionLogDate = text.slice("MEDIA_VERSION_LOG_DATE|".length).trim();
            return;
        }

        if (text.startsWith("MEDIA_VERSION_LOG_AT|")) {
            result.mediaVersionLogAt = text.slice("MEDIA_VERSION_LOG_AT|".length).trim();
            return;
        }

        if (text.startsWith("MEDIA_VERSION_LOG_NOTE|")) {
            result.mediaVersionLogNote = text.slice("MEDIA_VERSION_LOG_NOTE|".length).trim();
            return;
        }

        if (text.startsWith("DECOMP_STEP|")) {
            const stepText = text.slice("DECOMP_STEP|".length).trim();
            if (stepText) {
                result.decompositionSteps.push(stepText);
            }
            return;
        }

        if (text.startsWith("DECOMP_PUSH_AT|")) {
            result.decompositionLastPushAt = text.slice("DECOMP_PUSH_AT|".length).trim();
            return;
        }

        if (text.startsWith("DECOMP_PUSH_COUNT|")) {
            const count = Number(text.slice("DECOMP_PUSH_COUNT|".length).trim());
            result.decompositionLastPushCount = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
            return;
        }

        if (text.startsWith("SUBMITTED_AT|")) {
            result.submittedAt = text.slice("SUBMITTED_AT|".length).trim();
            return;
        }

        if (text.startsWith("REVIEW|")) {
            const status = text.slice("REVIEW|".length).trim().toLowerCase();
            if (status === "reviewed") {
                result.reviewStatus = "reviewed";
            } else if (status === "needs_changes" || status === "needs-changes" || status === "needs changes") {
                result.reviewStatus = "needs_changes";
            } else {
                result.reviewStatus = "pending";
            }
        }
    });

    return result;
}

function getFirstGoogleFormUrlFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    for (const row of rows) {
        for (const step of (Array.isArray(row?.steps) ? row.steps : [])) {
            const text = String(step?.text || "").trim();
            if (text.startsWith("GOOGLE_FORM_URL|")) {
                const url = toSafeGoogleFormUrl(text.slice("GOOGLE_FORM_URL|".length).trim());
                if (url) return url;
            }
        }
    }
    return "";
}

async function syncDigiMedConventionsFromSlide(projectId, email, taskTopicTitle) {
    const slideUrl = readStoredTaskTopicSlideSyncEntryByTemplateId(projectId, email, "relevant-digimed-conventions")?.url;
    const presentationId = extractSlidesIdFromValue(slideUrl);
    const driveAccessToken = readStoredHubDriveAccessToken();
    if (!presentationId || !driveAccessToken) return null;

    const response = await fetch("/api/student/drive-setup/read-relevant-conventions", {
        method: "POST",
        headers: buildWriteHeaders(),
        body: JSON.stringify({ driveAccessToken, presentationId })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "Could not read the conventions slideshow.");

    const standardKey = buildTaskTopicSubmissionStandardKey(taskTopicTitle, "91897");
    const evidenceRows = await fetchEvidenceRowsEnsuringAllocation(projectId, email);
    // Merge with previously acknowledged areas (manual ticks or earlier syncs) so a fresh
    // sync only adds newly-listed conventions and never silently unticks/loses existing ones.
    const existingSubmission = parseTaskTopicSubmissionFromEvidenceRows(evidenceRows, standardKey);
    const detected = { ...(existingSubmission.conventionAcknowledgements || {}) };
    (Array.isArray(payload?.areas) ? payload.areas : []).forEach((area) => {
        if (DIGIMED_CONVENTION_AREAS.includes(area)) detected[area] = true;
    });
    const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
        conventionAcknowledgements: detected,
        conventionsLastSyncAt: String(payload?.syncedAt || "").trim()
    });
    await saveEvidenceRows(projectId, email, nextRows);
    return { acknowledgements: detected, syncedAt: String(payload?.syncedAt || "").trim() };
}

function upsertTaskTopicSubmissionEvidenceRows(rows, standardKey, payload) {
    const existingSubmission = parseTaskTopicSubmissionFromEvidenceRows(rows, standardKey);
    const sourceRows = normalizeEvidenceSteps(rows).filter(
        (row) => String(row?.standard || "").trim() !== standardKey
    );

    const writtenEvidence = String(payload?.writtenEvidence || "").trim();
    const evidenceLink = toSafeExternalUrl(payload?.evidenceLink);
    const fileName = String(payload?.fileName || "").trim();
    const fileUrl = String(payload?.fileUrl || "").trim();
    const submittedAt = String(payload?.submittedAt || "").trim();
    const haparaAcknowledged = Boolean(payload?.haparaAcknowledged);
    const haparaSubmittedAt = String(payload?.haparaSubmittedAt || "").trim();
    const haparaLocation = String(payload?.haparaLocation || "").trim();
    const haparaDriveClassUrl = String(payload?.haparaDriveClassUrl || "").trim();
    const haparaDocumentRef = String(payload?.haparaDocumentRef || "").trim();
    const trelloCardUrl = payload?.trelloCardUrl !== undefined
        ? toSafeTrelloCardUrl(payload?.trelloCardUrl)
        : toSafeTrelloCardUrl(existingSubmission.trelloCardUrl);
    const trelloLastLogDate = payload?.trelloLastLogDate !== undefined
        ? String(payload?.trelloLastLogDate || "").trim()
        : String(existingSubmission.trelloLastLogDate || "").trim();
    const trelloLastLogAt = payload?.trelloLastLogAt !== undefined
        ? String(payload?.trelloLastLogAt || "").trim()
        : String(existingSubmission.trelloLastLogAt || "").trim();
    const trelloLastLogNote = payload?.trelloLastLogNote !== undefined
        ? String(payload?.trelloLastLogNote || "").trim()
        : String(existingSubmission.trelloLastLogNote || "").trim();
    const googleSlidesUrl = payload?.googleSlidesUrl !== undefined
        ? toSafeExternalUrl(payload?.googleSlidesUrl)
        : toSafeExternalUrl(existingSubmission.googleSlidesUrl || existingSubmission.evidenceLink);
    const googleFormUrl = payload?.googleFormUrl !== undefined
        ? toSafeGoogleFormUrl(payload?.googleFormUrl)
        : toSafeGoogleFormUrl(existingSubmission.googleFormUrl);
    const conventionAcknowledgements = payload?.conventionAcknowledgements !== undefined
        ? (payload.conventionAcknowledgements && typeof payload.conventionAcknowledgements === "object" ? payload.conventionAcknowledgements : {})
        : existingSubmission.conventionAcknowledgements;
    const conventionsLastSyncAt = payload?.conventionsLastSyncAt !== undefined
        ? String(payload?.conventionsLastSyncAt || "").trim()
        : String(existingSubmission.conventionsLastSyncAt || "").trim();
    const mediaAssetFolderUrl = payload?.mediaAssetFolderUrl !== undefined
        ? toSafeExternalUrl(payload?.mediaAssetFolderUrl)
        : toSafeExternalUrl(existingSubmission.mediaAssetFolderUrl);
    const googleDriveProjectFolderUrl = payload?.googleDriveProjectFolderUrl !== undefined
        ? toSafeExternalUrl(payload?.googleDriveProjectFolderUrl)
        : toSafeExternalUrl(existingSubmission.googleDriveProjectFolderUrl);
    const mediaReviewUrl = payload?.mediaReviewUrl !== undefined
        ? toSafeExternalUrl(payload?.mediaReviewUrl)
        : toSafeExternalUrl(existingSubmission.mediaReviewUrl);
    const mediaVersionLogDate = payload?.mediaVersionLogDate !== undefined
        ? String(payload?.mediaVersionLogDate || "").trim()
        : String(existingSubmission.mediaVersionLogDate || "").trim();
    const mediaVersionLogAt = payload?.mediaVersionLogAt !== undefined
        ? String(payload?.mediaVersionLogAt || "").trim()
        : String(existingSubmission.mediaVersionLogAt || "").trim();
    const mediaVersionLogNote = payload?.mediaVersionLogNote !== undefined
        ? String(payload?.mediaVersionLogNote || "").trim()
        : String(existingSubmission.mediaVersionLogNote || "").trim();
    const decompositionSteps = Array.isArray(payload?.decompositionSteps)
        ? parseDecompositionStepsText(payload.decompositionSteps.join("\n"))
        : parseDecompositionStepsText((existingSubmission.decompositionSteps || []).join("\n"));
    const decompositionLastPushAt = payload?.decompositionLastPushAt !== undefined
        ? String(payload?.decompositionLastPushAt || "").trim()
        : String(existingSubmission.decompositionLastPushAt || "").trim();
    const decompositionLastPushCount = payload?.decompositionLastPushCount !== undefined
        ? Math.max(0, Math.round(Number(payload?.decompositionLastPushCount) || 0))
        : Math.max(0, Math.round(Number(existingSubmission.decompositionLastPushCount) || 0));
    const reviewStatusRaw = String(payload?.reviewStatus || "").trim().toLowerCase();
    const reviewStatus = reviewStatusRaw === "reviewed"
        ? "reviewed"
        : (reviewStatusRaw === "needs_changes" || reviewStatusRaw === "needs-changes" || reviewStatusRaw === "needs changes")
            ? "needs_changes"
            : "pending";

    const steps = [];
    if (writtenEvidence) {
        steps.push({ text: `WRITTEN|${writtenEvidence}`, done: true });
    }
    if (evidenceLink) {
        steps.push({ text: `LINK|${evidenceLink}`, done: true });
    }
    if (fileName) {
        steps.push({ text: `FILE|${fileName}`, done: true });
    }
    if (fileUrl) {
        steps.push({ text: `FILE_URL|${fileUrl}`, done: true });
    }
    if (submittedAt) {
        steps.push({ text: `SUBMITTED_AT|${submittedAt}`, done: true });
    }
    steps.push({ text: `HAPARA_ACK|${haparaAcknowledged ? "true" : "false"}`, done: haparaAcknowledged });
    if (haparaSubmittedAt) {
        steps.push({ text: `HAPARA_SUBMITTED_AT|${haparaSubmittedAt}`, done: true });
    }
    if (haparaLocation) {
        steps.push({ text: `HAPARA_LOCATION|${haparaLocation}`, done: true });
    }
    if (haparaDriveClassUrl) {
        steps.push({ text: `HAPARA_CLASS_DRIVE|${haparaDriveClassUrl}`, done: true });
    }
    if (haparaDocumentRef) {
        steps.push({ text: `HAPARA_DOC_REF|${haparaDocumentRef}`, done: true });
    }
    if (trelloCardUrl) {
        steps.push({ text: `TRELLO_CARD_URL|${trelloCardUrl}`, done: true });
    }
    if (trelloLastLogDate) {
        steps.push({ text: `TRELLO_LAST_LOG_DATE|${trelloLastLogDate}`, done: true });
    }
    if (trelloLastLogAt) {
        steps.push({ text: `TRELLO_LAST_LOG_AT|${trelloLastLogAt}`, done: true });
    }
    if (trelloLastLogNote) {
        steps.push({ text: `TRELLO_LAST_LOG_NOTE|${trelloLastLogNote}`, done: true });
    }
    if (googleSlidesUrl) {
        steps.push({ text: `GOOGLE_SLIDES_URL|${googleSlidesUrl}`, done: true });
        steps.push({ text: `LINK|${googleSlidesUrl}`, done: true });
    }
    if (googleFormUrl) {
        steps.push({ text: `GOOGLE_FORM_URL|${googleFormUrl}`, done: true });
        steps.push({ text: `LINK|${googleFormUrl}`, done: true });
    }
    Object.entries(conventionAcknowledgements || {}).forEach(([area, acknowledged]) => {
        if (DIGIMED_CONVENTION_AREAS.includes(area)) {
            steps.push({ text: `CONVENTION_ACK|${area}|${Boolean(acknowledged)}`, done: Boolean(acknowledged) });
        }
    });
    if (conventionsLastSyncAt) {
        steps.push({ text: `CONVENTIONS_LAST_SYNC|${conventionsLastSyncAt}`, done: true });
    }
    if (mediaAssetFolderUrl) {
        steps.push({ text: `MEDIA_ASSET_FOLDER_URL|${mediaAssetFolderUrl}`, done: true });
        steps.push({ text: `ONEDRIVE_PROJECT_FOLDER_URL|${mediaAssetFolderUrl}`, done: true });
    }
    if (googleDriveProjectFolderUrl) {
        steps.push({ text: `GOOGLE_DRIVE_PROJECT_FOLDER_URL|${googleDriveProjectFolderUrl}`, done: true });
        steps.push({ text: `LINK|${googleDriveProjectFolderUrl}`, done: true });
    }
    if (mediaReviewUrl) {
        steps.push({ text: `MEDIA_REVIEW_URL|${mediaReviewUrl}`, done: true });
    }
    if (mediaVersionLogDate) {
        steps.push({ text: `MEDIA_VERSION_LOG_DATE|${mediaVersionLogDate}`, done: true });
    }
    if (mediaVersionLogAt) {
        steps.push({ text: `MEDIA_VERSION_LOG_AT|${mediaVersionLogAt}`, done: true });
    }
    if (mediaVersionLogNote) {
        steps.push({ text: `MEDIA_VERSION_LOG_NOTE|${mediaVersionLogNote}`, done: true });
    }
    decompositionSteps.forEach((stepText) => {
        steps.push({ text: `DECOMP_STEP|${stepText}`, done: true });
    });
    if (decompositionLastPushAt) {
        steps.push({ text: `DECOMP_PUSH_AT|${decompositionLastPushAt}`, done: true });
    }
    if (decompositionLastPushCount > 0) {
        steps.push({ text: `DECOMP_PUSH_COUNT|${decompositionLastPushCount}`, done: true });
    }
    steps.push({ text: `REVIEW|${reviewStatus}`, done: reviewStatus === "reviewed" });

    sourceRows.push({ standard: standardKey, steps });
    return sourceRows;
}

function formatSubmissionTimestamp(value) {
    const raw = String(value || "").trim();
    if (!raw) {
        return "Not submitted yet";
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return raw;
    }

    return parsed.toLocaleString();
}

function formatSyncCreatedDate(value) {
    const raw = String(value || "").trim();
    if (!raw) {
        return "Unknown";
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
        return "Unknown";
    }

    return parsed.toLocaleString();
}

function summarizeStudentSubmissionStatus(evidenceRows, todayNzKey = getNzDateKey()) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    let acknowledged = false;
    let trelloLogDate = "";
    let mediaLogDate = "";
    let trelloLinked = false;

    rows.forEach((row) => {
        (Array.isArray(row?.steps) ? row.steps : []).forEach((step) => {
            const text = String(step?.text || "").trim();
            if (!text) {
                return;
            }

            if (text.startsWith("HAPARA_ACK|")) {
                const value = text.slice("HAPARA_ACK|".length).trim().toLowerCase();
                acknowledged = value === "true" || value === "1" || value === "yes";
                return;
            }

            if (text.startsWith("SUBMITTED_AT|")) {
                const value = text.slice("SUBMITTED_AT|".length).trim();
                if (value) {
                    acknowledged = true;
                }
                return;
            }

            if (text.startsWith("TRELLO_LAST_LOG_DATE|")) {
                trelloLogDate = text.slice("TRELLO_LAST_LOG_DATE|".length).trim();
                return;
            }

            if (text.startsWith("TRELLO_CARD_URL|")) {
                const trelloUrl = toSafeTrelloCardUrl(text.slice("TRELLO_CARD_URL|".length).trim());
                if (trelloUrl) {
                    trelloLinked = true;
                }
                return;
            }

            if (text.startsWith("MEDIA_VERSION_LOG_DATE|")) {
                mediaLogDate = text.slice("MEDIA_VERSION_LOG_DATE|".length).trim();
            }
        });
    });

    const loggedToday = trelloLogDate === todayNzKey || mediaLogDate === todayNzKey;
    return { acknowledged, loggedToday, trelloLinked };
}

function getFirstTrelloCardUrlFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    for (const row of rows) {
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        for (const step of steps) {
            const text = String(step?.text || "").trim();
            if (!text.startsWith("TRELLO_CARD_URL|")) {
                continue;
            }

            const url = toSafeTrelloCardUrl(text.slice("TRELLO_CARD_URL|".length).trim());
            if (url) {
                return url;
            }
        }
    }

    return "";
}

function getAllTrelloCardUrlsFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    const collected = [];
    rows.forEach((row) => {
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        steps.forEach((step) => {
            const text = String(step?.text || "").trim();
            if (!text.startsWith("TRELLO_CARD_URL|")) {
                return;
            }

            const url = toSafeTrelloCardUrl(text.slice("TRELLO_CARD_URL|".length).trim());
            if (url) {
                collected.push(url);
            }
        });
    });
    return normalizeTrelloCardLibrary(collected);
}

function getLatestTrelloSavedAtFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    let latestIso = "";
    rows.forEach((row) => {
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        steps.forEach((step) => {
            const text = String(step?.text || "").trim();
            if (!text.startsWith("TRELLO_SAVED_AT|")) {
                return;
            }
            const value = text.slice("TRELLO_SAVED_AT|".length).trim();
            const parsed = Date.parse(value);
            if (!Number.isFinite(parsed)) {
                return;
            }
            if (!latestIso || parsed > Date.parse(latestIso)) {
                latestIso = new Date(parsed).toISOString();
            }
        });
    });
    return latestIso;
}

function toSafeGithubRepoUrl(value) {
    const safeUrl = toSafeExternalUrl(value);
    if (!safeUrl) return "";

    try {
        const parsed = new URL(safeUrl);
        const host = String(parsed.hostname || "").toLowerCase();
        if (!(host === "github.com" || host.endsWith(".github.com") || host === "gist.github.com")) {
            return "";
        }

        const segments = parsed.pathname.split("/").filter(Boolean);
        if ((host === "github.com" || host.endsWith(".github.com")) && segments.length < 2) {
            return "";
        }

        parsed.hash = "";
        return parsed.toString().replace(/\/$/, "");
    } catch (_error) {
        return "";
    }
}

function getFirstGithubRepoUrlFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    for (const row of rows) {
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        for (const step of steps) {
            const text = String(step?.text || "").trim();
            if (!text) continue;

            if (text.startsWith("GITHUB_REPO_URL|")) {
                const githubUrl = toSafeGithubRepoUrl(text.slice("GITHUB_REPO_URL|".length).trim());
                if (githubUrl) {
                    return githubUrl;
                }
            }

            if (text.startsWith("LINK|")) {
                const linked = toSafeGithubRepoUrl(text.slice("LINK|".length).trim());
                if (linked) {
                    return linked;
                }
            }
        }
    }

    return "";
}

function getAllGithubRepoUrlsFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    const urls = [];
    const seen = new Set();

    rows.forEach((row) => {
        (Array.isArray(row?.steps) ? row.steps : []).forEach((step) => {
            const text = String(step?.text || "").trim();
            if (!text) return;

            let candidate = "";
            if (text.startsWith("GITHUB_REPO_URL|")) {
                candidate = text.slice("GITHUB_REPO_URL|".length).trim();
            } else if (text.startsWith("LINK|")) {
                candidate = text.slice("LINK|".length).trim();
            }

            const safe = toSafeGithubRepoUrl(candidate);
            if (!safe || seen.has(safe)) return;
            seen.add(safe);
            urls.push(safe);
        });
    });

    return urls;
}

function upsertEvidenceStandardRow(rows, standardKey, steps) {
    const normalizedRows = normalizeEvidenceSteps(rows).filter(
        (row) => String(row?.standard || "").trim() !== String(standardKey || "").trim()
    );

    normalizedRows.push({
        standard: String(standardKey || "").trim(),
        steps: Array.isArray(steps) ? steps : []
    });

    return normalizeEvidenceSteps(normalizedRows);
}

// Strips a saved link from every evidence row that stores it, across all task-topic standards, so a deleted library entry cannot reappear on reload.
async function removeUrlFromEvidenceSteps(projectId, studentEmail, urlToRemove, prefixes) {
    const safeUrl = String(urlToRemove || "").trim();
    if (!projectId || !studentEmail || !safeUrl || !Array.isArray(prefixes) || !prefixes.length) {
        return false;
    }

    const rows = await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
    let changed = false;
    const nextRows = rows.map((row) => {
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        const filteredSteps = steps.filter((step) => {
            const text = String(step?.text || "").trim();
            const matchedPrefix = prefixes.find((prefix) => text.startsWith(prefix));
            if (!matchedPrefix) {
                return true;
            }
            if (text.slice(matchedPrefix.length).trim() === safeUrl) {
                changed = true;
                return false;
            }
            return true;
        });
        return { standard: String(row?.standard || "").trim(), steps: filteredSteps };
    });

    if (changed) {
        await saveEvidenceRows(projectId, studentEmail, nextRows);
    }
    return changed;
}

function getFirstOneDriveFolderUrlFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    for (const row of rows) {
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        for (const step of steps) {
            const text = String(step?.text || "").trim();
            if (text.startsWith("ONEDRIVE_PROJECT_FOLDER_URL|")) {
                const url = toSafeExternalUrl(text.slice("ONEDRIVE_PROJECT_FOLDER_URL|".length).trim());
                if (url) return url;
            }

            if (text.startsWith("MEDIA_ASSET_FOLDER_URL|")) {
                const url = toSafeExternalUrl(text.slice("MEDIA_ASSET_FOLDER_URL|".length).trim());
                if (url) return url;
            }

            if (text.startsWith("LINK|")) {
                const url = toSafeExternalUrl(text.slice("LINK|".length).trim());
                if (url && /(onedrive\.live\.com|1drv\.ms|sharepoint\.com)/i.test(url)) {
                    return url;
                }
            }
        }
    }

    return "";
}

function getAllOneDriveFolderUrlsFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    const urls = [];
    const seen = new Set();

    rows.forEach((row) => {
        (Array.isArray(row?.steps) ? row.steps : []).forEach((step) => {
            const text = String(step?.text || "").trim();
            if (!text) return;

            let candidate = "";
            if (text.startsWith("ONEDRIVE_PROJECT_FOLDER_URL|")) {
                candidate = text.slice("ONEDRIVE_PROJECT_FOLDER_URL|".length).trim();
            } else if (text.startsWith("MEDIA_ASSET_FOLDER_URL|")) {
                candidate = text.slice("MEDIA_ASSET_FOLDER_URL|".length).trim();
            } else if (text.startsWith("LINK|")) {
                candidate = text.slice("LINK|".length).trim();
            }

            const safe = toSafeOneDriveFolderUrl(candidate);
            if (!safe || seen.has(safe)) return;
            seen.add(safe);
            urls.push(safe);
        });
    });

    return urls;
}

function getFirstGoogleDriveFolderUrlFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    for (const row of rows) {
        const steps = Array.isArray(row?.steps) ? row.steps : [];
        for (const step of steps) {
            const text = String(step?.text || "").trim();
            if (text.startsWith("GOOGLE_DRIVE_PROJECT_FOLDER_URL|")) {
                const url = toSafeExternalUrl(text.slice("GOOGLE_DRIVE_PROJECT_FOLDER_URL|".length).trim());
                if (url) return url;
            }

            if (text.startsWith("LINK|")) {
                const url = toSafeExternalUrl(text.slice("LINK|".length).trim());
                if (url && /(drive\.google\.com)/i.test(url)) {
                    return url;
                }
            }
        }
    }

    return "";
}

function getAllGoogleDriveFolderUrlsFromEvidenceRows(evidenceRows) {
    const rows = normalizeEvidenceSteps(evidenceRows);
    const urls = [];
    const seen = new Set();

    rows.forEach((row) => {
        (Array.isArray(row?.steps) ? row.steps : []).forEach((step) => {
            const text = String(step?.text || "").trim();
            if (!text) return;

            let candidate = "";
            if (text.startsWith("GOOGLE_DRIVE_PROJECT_FOLDER_URL|")) {
                candidate = text.slice("GOOGLE_DRIVE_PROJECT_FOLDER_URL|".length).trim();
            } else if (text.startsWith("LINK|")) {
                candidate = text.slice("LINK|".length).trim();
            }

            const safe = toSafeGoogleDriveFolderUrl(candidate);
            if (!safe || seen.has(safe)) return;
            seen.add(safe);
            urls.push(safe);
        });
    });

    return urls;
}

async function persistStudentTrelloLink(projectId, studentEmail, trelloCardUrl) {
    const safeUrl = toSafeTrelloCardUrl(trelloCardUrl);
    if (!safeUrl) {
        throw new Error("Enter a valid Trello card or board link first.");
    }

    const saveTrelloLinkViaEvidence = async () => {
        const rows = await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
        const nextRows = upsertEvidenceStandardRow(rows, "trello-sync", [
            { text: `TRELLO_CARD_URL|${safeUrl}`, done: true },
            { text: `TRELLO_SAVED_AT|${new Date().toISOString()}`, done: true }
        ]);
        await saveEvidenceRows(projectId, studentEmail, nextRows);
    };

    const saveTrelloLinkMeEndpoint = async () => {
        const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/interests/me/trello-link`, {
            method: "PATCH",
            headers: buildWriteHeaders(),
            body: JSON.stringify({ trello_card_url: safeUrl })
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const error = new Error(payload?.error || "Could not save Trello link.");
            error.status = Number(response.status || 0);
            throw error;
        }
    };

    const saveTrelloLinkLegacyEndpoint = async () => {
        const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/trello-link`, {
            method: "PATCH",
            headers: buildWriteHeaders(),
            body: JSON.stringify({ trello_card_url: safeUrl })
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const error = new Error(payload?.error || "Could not save Trello link.");
            error.status = Number(response.status || 0);
            throw error;
        }
    };

    // Primary path: persist via evidence rows (most reliable in this page context).
    await saveTrelloLinkViaEvidence();

    // Secondary path: keep dedicated endpoint in sync, but do not block success.
    try {
        await saveTrelloLinkMeEndpoint();
    } catch (_error) {
        // Fallback to original student-email endpoint for backward compatibility.
        try {
            await saveTrelloLinkLegacyEndpoint();
        } catch (_legacyError) {
            // Evidence rows already contain the Trello URL; keep UX successful.
        }
    }
}

async function persistStudentTrelloLinkForTaskTopic(projectId, studentEmail, detailData, taskTopicTitle, trelloCardUrl) {
    const safeUrl = toSafeTrelloCardUrl(trelloCardUrl);
    if (!safeUrl) {
        throw new Error("Enter a valid Trello card or board link first.");
    }

    const safeTaskTopic = String(taskTopicTitle || "").trim();
    if (!safeTaskTopic) {
        return;
    }

    const standardNumber = extractPrimaryStandardNumberFromRows(coerceArray(detailData?.standardDetails));
    const standardKey = buildTaskTopicSubmissionStandardKey(safeTaskTopic, standardNumber);
    const evidenceRows = await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
    const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
        trelloCardUrl: safeUrl
    });
    await saveEvidenceRows(projectId, studentEmail, nextRows);
}

async function persistStudentTrelloLinkDirectlyToEvidence(projectId, studentEmail, detailData, taskTopicTitle, trelloCardUrl) {
    const safeUrl = toSafeTrelloCardUrl(trelloCardUrl);
    if (!safeUrl) {
        throw new Error("Enter a valid Trello card or board link first.");
    }

    const fetchMyEvidenceRows = async () => {
        const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/my-evidence`, {
            headers: buildWriteHeaders()
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const error = new Error(payload?.error || "Could not load my evidence rows.");
            error.status = Number(response.status || 0);
            throw error;
        }
        const payload = await response.json().catch(() => ({}));
        return normalizeEvidenceSteps(payload?.evidence_steps);
    };

    const saveMyEvidenceRows = async (rows) => {
        const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/my-evidence`, {
            method: "PATCH",
            headers: buildWriteHeaders(),
            body: JSON.stringify({ evidence_steps: normalizeEvidenceSteps(rows) })
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const error = new Error(payload?.error || "Could not save my evidence rows.");
            error.status = Number(response.status || 0);
            throw error;
        }
    };

    let nextRows = [];
    try {
        nextRows = await fetchMyEvidenceRows();
    } catch (error) {
        if (Number(error?.status || 0) !== 404) {
            throw error;
        }
        // Ensure allocation exists then retry my-evidence endpoint.
        await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
        nextRows = await fetchMyEvidenceRows();
    }

    nextRows = upsertEvidenceStandardRow(nextRows, "trello-sync", [
        { text: `TRELLO_CARD_URL|${safeUrl}`, done: true },
        { text: `TRELLO_SAVED_AT|${new Date().toISOString()}`, done: true }
    ]);

    const safeTaskTopic = String(taskTopicTitle || "").trim();
    if (safeTaskTopic) {
        const standardNumber = extractPrimaryStandardNumberFromRows(coerceArray(detailData?.standardDetails));
        const standardKey = buildTaskTopicSubmissionStandardKey(safeTaskTopic, standardNumber);
        nextRows = upsertTaskTopicSubmissionEvidenceRows(nextRows, standardKey, {
            trelloCardUrl: safeUrl
        });
    }

    await saveMyEvidenceRows(nextRows);
}

async function persistStudentGithubSync(projectId, studentEmail, githubRepoUrl, githubNote = "") {
    const safeRepoUrl = toSafeGithubRepoUrl(githubRepoUrl);
    if (!safeRepoUrl) {
        throw new Error("Enter a valid GitHub repository link first.");
    }

    const safeNote = String(githubNote || "").trim();
    const rows = await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
    const steps = [
        { text: `GITHUB_REPO_URL|${safeRepoUrl}`, done: true },
        { text: `GITHUB_SAVED_AT|${new Date().toISOString()}`, done: true }
    ];
    if (safeNote) {
        steps.push({ text: `GITHUB_WORK_NOTE|${safeNote}`, done: true });
    }

    const nextRows = upsertEvidenceStandardRow(rows, "github-sync", steps);
    await saveEvidenceRows(projectId, studentEmail, nextRows);
}

async function persistStudentGithubSyncDirectlyToEvidence(projectId, studentEmail, detailData, taskTopicTitle, githubRepoUrl, githubNote = "") {
    const safeRepoUrl = toSafeGithubRepoUrl(githubRepoUrl);
    if (!safeRepoUrl) {
        throw new Error("Enter a valid GitHub repository link first.");
    }

    const safeNote = String(githubNote || "").trim();

    const fetchMyEvidenceRows = async () => {
        const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/my-evidence`, {
            headers: buildWriteHeaders()
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const error = new Error(payload?.error || "Could not load my evidence rows.");
            error.status = Number(response.status || 0);
            throw error;
        }
        const payload = await response.json().catch(() => ({}));
        return normalizeEvidenceSteps(payload?.evidence_steps);
    };

    const saveMyEvidenceRows = async (rows) => {
        const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/my-evidence`, {
            method: "PATCH",
            headers: buildWriteHeaders(),
            body: JSON.stringify({ evidence_steps: normalizeEvidenceSteps(rows) })
        });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            const error = new Error(payload?.error || "Could not save my evidence rows.");
            error.status = Number(response.status || 0);
            throw error;
        }
    };

    let nextRows = [];
    try {
        nextRows = await fetchMyEvidenceRows();
    } catch (error) {
        if (Number(error?.status || 0) !== 404) {
            throw error;
        }
        await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
        nextRows = await fetchMyEvidenceRows();
    }

    const steps = [
        { text: `GITHUB_REPO_URL|${safeRepoUrl}`, done: true },
        { text: `GITHUB_SAVED_AT|${new Date().toISOString()}`, done: true }
    ];
    if (safeNote) {
        steps.push({ text: `GITHUB_WORK_NOTE|${safeNote}`, done: true });
    }
    nextRows = upsertEvidenceStandardRow(nextRows, "github-sync", steps);

    const safeTaskTopic = String(taskTopicTitle || "").trim();
    if (safeTaskTopic) {
        const standardNumber = extractPrimaryStandardNumberFromRows(coerceArray(detailData?.standardDetails));
        const standardKey = buildTaskTopicSubmissionStandardKey(safeTaskTopic, standardNumber);
        nextRows = upsertTaskTopicSubmissionEvidenceRows(nextRows, standardKey, {
            evidenceLink: safeRepoUrl
        });
    }

    await saveMyEvidenceRows(nextRows);
}

async function persistStudentOneDriveFolderLink(projectId, studentEmail, detailData, taskTopicTitle, oneDriveFolderUrl) {
    const safeUrl = toSafeExternalUrl(oneDriveFolderUrl);
    if (!safeUrl) {
        throw new Error("Enter a valid OneDrive or SharePoint folder link first.");
    }

    const safeTaskTopic = String(taskTopicTitle || "").trim();
    if (!safeTaskTopic) {
        throw new Error("Open a task-topic page before saving OneDrive link.");
    }

    const standardNumber = extractPrimaryStandardNumberFromRows(coerceArray(detailData?.standardDetails));
    const standardKey = buildTaskTopicSubmissionStandardKey(safeTaskTopic, standardNumber);

    const evidenceRows = await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
    const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
        mediaAssetFolderUrl: safeUrl
    });
    await saveEvidenceRows(projectId, studentEmail, nextRows);
}

async function persistStudentGoogleDriveFolderLink(projectId, studentEmail, detailData, taskTopicTitle, googleDriveFolderUrl) {
    const safeUrl = toSafeExternalUrl(googleDriveFolderUrl);
    if (!safeUrl) {
        throw new Error("Enter a valid Google Drive folder link first.");
    }

    if (!/(drive\.google\.com)/i.test(safeUrl)) {
        throw new Error("Use a Google Drive folder URL.");
    }

    const safeTaskTopic = String(taskTopicTitle || "").trim();
    if (!safeTaskTopic) {
        throw new Error("Open a task-topic page before saving Google Drive link.");
    }

    const standardNumber = extractPrimaryStandardNumberFromRows(coerceArray(detailData?.standardDetails));
    const standardKey = buildTaskTopicSubmissionStandardKey(safeTaskTopic, standardNumber);

    const evidenceRows = await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
    const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
        googleDriveProjectFolderUrl: safeUrl
    });
    await saveEvidenceRows(projectId, studentEmail, nextRows);
}

async function persistStudentGoogleFormLink(projectId, studentEmail, detailData, taskTopicTitle, googleFormUrl) {
    const safeUrl = toSafeGoogleFormUrl(googleFormUrl);
    if (!safeUrl) {
        throw new Error("Enter a valid Google Forms link first.");
    }

    const safeTaskTopic = String(taskTopicTitle || "").trim();
    if (!safeTaskTopic) {
        throw new Error("Open the Testing Functions task-topic page before saving the form link.");
    }

    const standardNumber = extractPrimaryStandardNumberFromRows(coerceArray(detailData?.standardDetails));
    const standardKey = buildTaskTopicSubmissionStandardKey(safeTaskTopic, standardNumber);
    const evidenceRows = await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
    const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, { googleFormUrl: safeUrl });
    await saveEvidenceRows(projectId, studentEmail, nextRows);
}

async function ensureStudentProcessAssessmentFolderLink(projectId, studentEmail, detailData, taskTopicTitle, evidenceRows) {
    const existingLink = getFirstGoogleDriveFolderUrlFromEvidenceRows(evidenceRows);
    if (existingLink) {
        return existingLink;
    }

    const processAssessmentFolderUrl = await fetchStudentProcessAssessmentFolderUrl();
    if (!processAssessmentFolderUrl) {
        return "";
    }

    try {
        await persistStudentGoogleDriveFolderLink(
            projectId,
            studentEmail,
            detailData,
            taskTopicTitle,
            processAssessmentFolderUrl
        );
    } catch (error) {
        console.warn("Could not automatically save the Process Assessment folder link.", error);
    }

    return processAssessmentFolderUrl;
}

// Digital Outcome Task Topic Slideshow Sync
async function openDigitalOutcomeTaskTopicSyncModal(projectId, email, taskTopicTitle, taskTopicShortName, syncTemplateId, syncTopicLabel) {
    const container = document.createElement("div");
    container.className = "modal-overlay";
    container.id = "task-topic-sync-modal";
    container.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-header">
                <h2>Sync Slideshow for ${escapeHtml(syncTopicLabel)}</h2>
                <button type="button" class="modal-close" aria-label="Close">×</button>
            </div>
            <div class="modal-body">
                <div class="modal-section">
                    <label for="sync-slides-url" class="modal-label">Google Slides Link or Folder Link</label>
                    <input 
                        id="sync-slides-url" 
                        type="url" 
                        class="modal-input" 
                        placeholder="https://docs.google.com/presentation/d/... or https://drive.google.com/drive/folders/..."
                        aria-describedby="sync-url-help"
                    >
                    <small id="sync-url-help" class="modal-help">Paste a Google Slides URL or a Google Drive folder URL containing slideshows.</small>
                </div>
                <div class="modal-section">
                    <div id="sync-loading" class="modal-message" style="display: none;">Loading slideshows...</div>
                    <div id="sync-error" class="modal-message modal-error" style="display: none;"></div>
                    <div id="sync-slideshows" class="modal-section" style="display: none;">
                        <label for="sync-select-slideshow" class="modal-label">Select Slideshow</label>
                        <select id="sync-select-slideshow" class="modal-select">
                            <option value="">Choose a slideshow...</option>
                        </select>
                    </div>
                    <div id="sync-preview" style="display: none;">
                        <p class="modal-label">Preview</p>
                        <div class="sync-preview-container">
                            <img id="sync-preview-image" src="" alt="First slide preview" class="sync-preview-image">
                            <div id="sync-preview-info" class="sync-preview-info"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-button modal-button-secondary" id="sync-cancel-btn">Cancel</button>
                <button type="button" class="modal-button" id="sync-confirm-btn" disabled>Confirm & Sync</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(container);
    
    const closeBtn = container.querySelector(".modal-close");
    const cancelBtn = container.querySelector("#sync-cancel-btn");
    const confirmBtn = container.querySelector("#sync-confirm-btn");
    const urlInput = container.querySelector("#sync-slides-url");
    const loadingDiv = container.querySelector("#sync-loading");
    const errorDiv = container.querySelector("#sync-error");
    const slideshowsDiv = container.querySelector("#sync-slideshows");
    const selectSlideshow = container.querySelector("#sync-select-slideshow");
    const previewDiv = container.querySelector("#sync-preview");
    const previewImage = container.querySelector("#sync-preview-image");
    const previewInfo = container.querySelector("#sync-preview-info");
    
    let selectedSlideshow = null;
    
    const closeModal = () => container.remove();
    const showError = (msg) => {
        errorDiv.textContent = msg;
        errorDiv.style.display = "block";
    };
    const clearError = () => {
        errorDiv.textContent = "";
        errorDiv.style.display = "none";
    };
    
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    
    // Handle URL input change
    urlInput.addEventListener("change", async () => {
        clearError();
        const url = toSafeExternalUrl(urlInput.value || "");
        if (!url) {
            slideshowsDiv.style.display = "none";
            previewDiv.style.display = "none";
            confirmBtn.disabled = true;
            return;
        }
        
        loadingDiv.style.display = "block";
        slideshowsDiv.style.display = "none";
        previewDiv.style.display = "none";
        confirmBtn.disabled = true;
        selectSlideshow.innerHTML = '<option value="">Choose a slideshow...</option>';
        selectedSlideshow = null;
        
        try {
            const slideshows = await extractSlideshowsFromUrl(url, email);
            if (!slideshows || slideshows.length === 0) {
                showError("No slideshows found at that location.");
                loadingDiv.style.display = "none";
                return;
            }
            
            selectSlideshow.innerHTML = '<option value="">Choose a slideshow...</option>' + 
                slideshows.map((s, i) => `<option value="${i}">${escapeHtml(s.name)}</option>`).join("");
            slideshowsDiv.style.display = "block";
            loadingDiv.style.display = "none";
            
            // Auto-select if only one slideshow
            if (slideshows.length === 1) {
                selectSlideshow.value = "0";
                await loadSlideShowPreview(slideshows[0]);
            }
        } catch (err) {
            showError(err.message || "Failed to load slideshows.");
            loadingDiv.style.display = "none";
        }
    });
    
    // Handle slideshow selection
    selectSlideshow.addEventListener("change", async () => {
        const idx = parseInt(selectSlideshow.value, 10);
        if (isNaN(idx)) {
            previewDiv.style.display = "none";
            confirmBtn.disabled = true;
            selectedSlideshow = null;
            return;
        }
        
        try {
            loadingDiv.style.display = "block";
            const url = toSafeExternalUrl(urlInput.value || "");
            const slideshows = await extractSlideshowsFromUrl(url, email);
            const slideshow = slideshows[idx];
            await loadSlideShowPreview(slideshow);
            loadingDiv.style.display = "none";
        } catch (err) {
            showError(err.message || "Failed to load slideshow preview.");
            loadingDiv.style.display = "none";
        }
    });
    
    async function loadSlideShowPreview(slideshow) {
        try {
            const thumbnailUrl = await getFirstSlideThumbnail(slideshow.id, email);
            previewImage.src = thumbnailUrl;
            previewInfo.innerHTML = `
                <p><strong>${escapeHtml(slideshow.name)}</strong></p>
                <p class="sync-preview-meta">ID: ${escapeHtml(slideshow.id)}</p>
            `;
            previewDiv.style.display = "block";
            selectedSlideshow = { ...slideshow, thumbnailUrl };
            confirmBtn.disabled = false;
        } catch (err) {
            showError(err.message || "Failed to load preview.");
        }
    }
    
    confirmBtn.addEventListener("click", async () => {
        if (!selectedSlideshow) {
            showError("Please select a slideshow.");
            return;
        }
        
        confirmBtn.disabled = true;
        try {
            // Update the hero preview image without persisting sync entry
            // Sync Slideshow is for teacher preview only, not for student submission tracking
            const slideshowUrl = `https://docs.google.com/presentation/d/${encodeURIComponent(selectedSlideshow.id)}/edit`;
            const thumbnailUrl = selectedSlideshow.thumbnailUrl || toGoogleSlidesThumbnailUrl(slideshowUrl);
            
            updateTaskTopicTemplateHeroPreview(
                document.querySelector("#task-topic-hero"),
                slideshowUrl,
                syncTopicLabel,
                thumbnailUrl
            );
            
            closeModal();
        } catch (err) {
            showError(err.message || "Failed to update preview.");
            confirmBtn.disabled = false;
        }
    });
    
    // Focus the input
    urlInput.focus();
}

async function extractSlideshowsFromUrl(url, email) {
    // Extract folder or presentation ID
    const folderId = url.match(/\/folders\/([a-zA-Z0-9-_]+)/)?.[1];
    const presentationId = url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
    
    if (presentationId && !folderId) {
        // Direct slideshow URL
        return [{
            id: presentationId,
            name: "Selected Presentation"
        }];
    }
    
    if (folderId) {
        // Fetch slideshows from folder via backend
        const accessToken = readStoredHubDriveAccessToken();
        if (!accessToken) {
            throw new Error("Not authenticated with Google Drive. Please ensure your Google account is linked.");
        }
        
        try {
            const response = await fetch("/api/student/drive-setup/list-slideshows", {
                method: "POST",
                headers: buildWriteHeaders(),
                body: JSON.stringify({
                    driveAccessToken: accessToken,
                    folderId: folderId
                })
            });
            
            if (!response.ok) {
                // Fallback: if backend endpoint doesn't exist, ask user to provide direct slideshow URL
                throw new Error("Folder browsing not yet available. Please paste a direct Google Slides presentation URL instead.");
            }
            
            const payload = await response.json().catch(() => ({}));
            const slideshows = Array.isArray(payload?.slideshows) ? payload.slideshows : [];
            if (!slideshows.length) {
                throw new Error("No slideshows found in that folder.");
            }
            return slideshows;
        } catch (err) {
            // Enhanced error messaging
            const errMsg = String(err?.message || "Failed to load slideshows from folder.");
            throw new Error(errMsg);
        }
    }
    
    throw new Error("Please provide a valid Google Slides URL (https://docs.google.com/presentation/d/...) or a Google Drive folder URL.");
}

async function getFirstSlideThumbnail(presentationId, email) {
    const accessToken = readStoredHubDriveAccessToken();
    if (!accessToken) {
        // Fall back to direct thumbnail URL
        return toGoogleSlidesThumbnailUrl(`https://docs.google.com/presentation/d/${encodeURIComponent(presentationId)}/edit`);
    }
    
    try {
        const response = await fetch("/api/student/drive-setup/get-slideshow-thumbnail", {
            method: "POST",
            headers: buildWriteHeaders(),
            body: JSON.stringify({
                driveAccessToken: accessToken,
                presentationId: presentationId
            })
        });
        
        if (!response.ok) {
            return toGoogleSlidesThumbnailUrl(`https://docs.google.com/presentation/d/${encodeURIComponent(presentationId)}/edit`);
        }
        
        const payload = await response.json().catch(() => ({}));
        return toSafeExternalUrl(payload?.thumbnailUrl || "") || 
               toGoogleSlidesThumbnailUrl(`https://docs.google.com/presentation/d/${encodeURIComponent(presentationId)}/edit`);
    } catch (_err) {
        return toGoogleSlidesThumbnailUrl(`https://docs.google.com/presentation/d/${encodeURIComponent(presentationId)}/edit`);
    }
}

async function persistTaskTopicSlideShowSync(projectId, email, taskTopicTitle, taskTopicShortName, slideshowUrl, metadata = {}) {
    const safeUrl = toSafeExternalUrl(slideshowUrl);
    if (!safeUrl) {
        throw new Error("Invalid slideshow URL.");
    }
    
    if (!safeUrl.includes("docs.google.com") && !safeUrl.includes("presentation")) {
        throw new Error("Use a Google Slides URL.");
    }
    
    writeStoredTaskTopicSlideSyncLink(projectId, email, taskTopicTitle, taskTopicShortName, safeUrl, metadata);
    
    // Also persist to backend for consistency
    try {
        const standardNumber = "";
        const standardKey = buildTaskTopicSubmissionStandardKey(taskTopicTitle, standardNumber);
        const evidenceRows = await fetchEvidenceRowsEnsuringAllocation(projectId, email);
        const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
            taskTopicSlideshowUrl: safeUrl
        });
        await saveEvidenceRows(projectId, email, nextRows);
    } catch (_err) {
        // Still succeed with localStorage sync even if backend fails
    }
}

function getReviewStatusLabel(value) {
    const status = String(value || "").trim().toLowerCase();
    if (status === "reviewed") {
        return "Reviewed";
    }
    if (status === "needs_changes" || status === "needs-changes" || status === "needs changes") {
        return "Needs changes";
    }
    return "Pending review";
}

function getNzDateKey(date = new Date()) {
    try {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Pacific/Auckland",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(date);
    } catch (_error) {
        return new Date(date).toISOString().slice(0, 10);
    }
}

function deriveInitialsFromEmail(value) {
    const raw = String(value || "").trim().toLowerCase();
    const localPart = raw.includes("@") ? raw.split("@")[0] : raw;
    const parts = localPart
        .split(/[^a-z0-9]+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (!parts.length) {
        return "xx";
    }

    if (parts.length === 1) {
        const token = parts[0];
        return (token.slice(0, 2) || "xx").toLowerCase();
    }

    return `${parts[0][0] || "x"}${parts[parts.length - 1][0] || "x"}`.toLowerCase();
}

function deriveDisplayNameFromEmail(value) {
    const raw = String(value || "").trim().toLowerCase();
    const localPart = raw.includes("@") ? raw.split("@")[0] : raw;
    const parts = localPart
        .split(/[^a-z0-9]+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (!parts.length) {
        return "Student";
    }

    return parts
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function parseDecompositionStepsText(value) {
    const seen = new Set();
    return String(value || "")
        .split(/\r?\n/)
        .map((line) => line.replace(/^[\-*\d\.)\s]+/, "").trim())
        .filter(Boolean)
        .filter((line) => {
            const key = line.toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        })
        .slice(0, 30);
}

// DB-backed record of template copies written by Task List "Sync from Google Drive".
// Works across devices/browsers, unlike the localStorage sync entries.
const dbTemplateCopiesCache = new Map();
async function fetchDbTemplateCopies(projectId) {
    const safeProjectId = String(projectId || "").trim();
    if (!safeProjectId) return [];
    if (dbTemplateCopiesCache.has(safeProjectId)) {
        return dbTemplateCopiesCache.get(safeProjectId);
    }
    try {
        const response = await fetch(`/api/activities/${encodeURIComponent(safeProjectId)}/my-template-copies`, { headers: buildAuthHeaders({}) });
        if (!response.ok) return [];
        const payload = await response.json().catch(() => ({}));
        const copies = Array.isArray(payload?.template_copies) ? payload.template_copies : [];
        dbTemplateCopiesCache.set(safeProjectId, copies);
        return copies;
    } catch (_error) {
        return [];
    }
}

function getDbTemplateCopyUrlById(copies, templateId) {
    const target = String(templateId || "").trim().toLowerCase();
    if (!target) return "";
    const match = (Array.isArray(copies) ? copies : [])
        .find((copy) => String(copy?.templateId || "").trim().toLowerCase() === target);
    return toSafeExternalUrl(match?.fileUrl || "");
}

function renderDigitalOutcomeMustDos(host, presentationUrl, targetId = "digital-outcome-must-dos") {
    const target = host?.querySelector(`#${targetId}`);
    if (!target) return;

    const linkedPresentationUrl = toSafeExternalUrl(presentationUrl);
    const appropriatePresentationUrl = linkedPresentationUrl || "https://docs.google.com/presentation/d/1brOY70u9aJdsoiEtxVepr82vRhiv9VzpMm8TUv3lcTo/edit?usp=sharing";
    const presentationId = extractSlidesIdFromValue(linkedPresentationUrl);
    const slideshowLink = `<p class="digital-outcome-must-dos-link"><a href="${escapeHtml(appropriatePresentationUrl)}" target="_blank" rel="noreferrer">Open Digital Outcome Description slideshow</a>${linkedPresentationUrl ? "" : " <span>(template)</span>"}</p>`;
    if (!presentationId) {
        target.innerHTML = `${slideshowLink}<p class="task-topic-submission-note">Link your personal Digital Outcome Description slideshow to see your MUST-DOs here.</p>`;
        return;
    }

    const driveAccessToken = readStoredHubDriveAccessToken();
    if (!driveAccessToken) {
        target.innerHTML = `${slideshowLink}<p class="task-topic-submission-note">Connect Google Drive to read the MUST-DOs from your slideshow.</p>`;
        return;
    }

    target.innerHTML = `${slideshowLink}<p class="task-topic-submission-note">Reading the MUST-DOs from your slideshow...</p>`;
    void fetch("/api/student/drive-setup/read-digital-outcome-must-dos", {
        method: "POST",
        headers: buildWriteHeaders(),
        body: JSON.stringify({ driveAccessToken, presentationId })
    }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Could not read your slideshow.");

        const mustDos = Array.isArray(payload?.mustDos) ? payload.mustDos : [];
        target.innerHTML = mustDos.length
            ? `${slideshowLink}<h3>MUST-DOs from your slideshow</h3><ul class="list task-topic-guide-list">${mustDos.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p class="task-topic-submission-note">Last read: ${escapeHtml(formatSubmissionTimestamp(payload?.syncedAt || ""))}</p>`
            : `${slideshowLink}<p class="task-topic-submission-note">No MUST-DO bullet points were found in the linked slideshow yet.</p>`;
    }).catch((error) => {
        target.innerHTML = `${slideshowLink}<p class="task-topic-submission-note is-error">${escapeHtml(error?.message || "Could not read your slideshow.")}</p>`;
    });
}

function readStoredRelevantImplicationsSlideUrl(projectId, email) {
    return readStoredRelevantImplicationsSlideEntries(projectId, email)[0]?.url || "";
}

function readStoredRelevantImplicationsSlideEntries(projectId, email) {
    const prefix = `${TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}:`;
    const entries = [];
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = String(localStorage.key(index) || "");
            if (!key.startsWith(prefix)) continue;
            const parsed = JSON.parse(localStorage.getItem(key) || "{}");
            if (!/^relevant-implications(?:-|$)/i.test(String(parsed?.templateId || "").trim())) continue;
            const url = toSafeExternalUrl(parsed?.url || "");
            if (url && !entries.some((entry) => entry.url === url)) {
                entries.push({
                    url,
                    name: String(parsed?.templateTitle || "Relevant Implications slideshow").trim()
                });
            }
        }
    } catch (_error) {
        return [];
    }
    return entries;
}

async function renderRelevantImplicationNames(host, projectId, email) {
    const target = host?.querySelector("#success-criteria-relevant-implications");
    if (!target) return;
    const entries = readStoredRelevantImplicationsSlideEntries(projectId, email);
    // Merge in DB records from Task List "Sync from Google Drive"
    const dbCopies = await fetchDbTemplateCopies(projectId);
    dbCopies.forEach((copy) => {
        if (!/^relevant-implications(?:-|$)/i.test(String(copy?.templateId || "").trim())) return;
        const url = toSafeExternalUrl(copy?.fileUrl || "");
        if (url && !entries.some((entry) => entry.url === url)) {
            entries.push({
                url,
                name: String(copy?.templateTitle || "Relevant Implications slideshow").trim()
            });
        }
    });
    const displayName = (value) => String(value || "Relevant Implication")
        .replace(/^relevant\s+implications?\s*-\s*/i, "")
        .replace(/\s*-\s*[a-z][a-z0-9._-]*$/i, "")
        .trim() || "Relevant Implication";
    target.innerHTML = entries.length
        ? `<h3>Relevant Implications</h3><ul class="list task-topic-guide-list">${entries.map((entry) => `<li><a href="${escapeHtml(entry.url)}" target="_blank" rel="noreferrer">${escapeHtml(displayName(entry.name))}</a></li>`).join("")}</ul>`
        : `<p class="task-topic-submission-note">No Relevant Implications slideshows have been linked yet.</p>`;
}

function renderRelevantImplicationsFromSlide(host, presentationUrl) {
    const target = host?.querySelector("#relevant-implications-from-slide");
    if (!target) return;
    const linkedUrl = toSafeExternalUrl(presentationUrl);
    const presentationId = extractSlidesIdFromValue(linkedUrl);
    if (!presentationId) {
        target.innerHTML = `<p class="task-topic-submission-note">Link your Relevant Implications slideshow to see the implications you have discussed.</p>`;
        return;
    }
    const driveAccessToken = readStoredHubDriveAccessToken();
    const slideshowLink = `<p class="digital-outcome-must-dos-link"><a href="${escapeHtml(linkedUrl)}" target="_blank" rel="noreferrer">Open Relevant Implications slideshow</a></p>`;
    if (!driveAccessToken) {
        target.innerHTML = `${slideshowLink}<p class="task-topic-submission-note">Connect Google Drive to read your discussed implications.</p>`;
        return;
    }
    target.innerHTML = `${slideshowLink}<p class="task-topic-submission-note">Reading your discussed implications...</p>`;
    void fetch("/api/student/drive-setup/read-relevant-implications", {
        method: "POST",
        headers: buildWriteHeaders(),
        body: JSON.stringify({ driveAccessToken, presentationId })
    }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Could not read your Relevant Implications slideshow.");
        const fileName = String(payload?.fileName || "Relevant Implications slideshow").trim();
        target.innerHTML = `${slideshowLink}<h3>Relevant Implications slideshows</h3><ul class="list task-topic-guide-list"><li><a href="${escapeHtml(payload?.fileUrl || linkedUrl)}" target="_blank" rel="noreferrer">${escapeHtml(fileName)}</a></li></ul><p class="task-topic-submission-note">Last read: ${escapeHtml(formatSubmissionTimestamp(payload?.syncedAt || ""))}</p>`;
    }).catch((error) => {
        target.innerHTML = `${slideshowLink}<p class="task-topic-submission-note is-error">${escapeHtml(error?.message || "Could not read your slideshow.")}</p>`;
    });
}

async function renderDevelopmentStepsMustDosTable(host, projectId, email) {
    const target = host?.querySelector("#development-steps-must-dos");
    if (!target) return;

    let digitalOutcomeUrl = readStoredTaskTopicSlideSyncEntryByTemplateId(projectId, email, "digital-outcome-description")?.url
        || readStoredTaskTopicSlideSyncEntryByShortName(projectId, email, "Digital Outcome Description")?.url
        || "";
    let developmentStepsUrl = readStoredTaskTopicSlideSyncEntryByTemplateId(projectId, email, "development-steps")?.url
        || readStoredTaskTopicSlideSyncEntryByShortName(projectId, email, "Development Steps")?.url
        || "";
    if (!digitalOutcomeUrl) digitalOutcomeUrl = (await findProcessAssessmentSlideMatch("Digital Outcome Description")).fileUrl;
    if (!developmentStepsUrl) developmentStepsUrl = (await findProcessAssessmentSlideMatch("Development Steps")).fileUrl;
    const digitalOutcomeId = extractSlidesIdFromValue(digitalOutcomeUrl);
    const developmentStepsId = extractSlidesIdFromValue(developmentStepsUrl);
    const driveAccessToken = readStoredHubDriveAccessToken();

    if (!driveAccessToken || !digitalOutcomeId) {
        target.innerHTML = `<p class="task-topic-submission-note">Link your Digital Outcome Description slideshow to build this table.</p>`;
        return;
    }

    target.innerHTML = `<p class="task-topic-submission-note">Reading MUST-DOs${developmentStepsId ? " and Development Steps components" : " from your Digital Outcome Description"}...</p>`;
    const readJson = (url, presentationId) => fetch(url, {
        method: "POST",
        headers: buildWriteHeaders(),
        body: JSON.stringify({ driveAccessToken, presentationId })
    }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Could not read the slideshow.");
        return payload;
    });

    const tasks = [
        readJson("/api/student/drive-setup/read-digital-outcome-must-dos", digitalOutcomeId),
        ...(developmentStepsId ? [readJson("/api/student/drive-setup/read-development-components", developmentStepsId)] : [])
    ];

    void Promise.all(tasks).then(([mustDosPayload, componentsPayload]) => {
        const mustDos = Array.isArray(mustDosPayload?.mustDos) ? mustDosPayload.mustDos : [];
        const componentRows = Array.isArray(componentsPayload?.rows) ? componentsPayload.rows : [];
        const components = Array.isArray(componentsPayload?.components) ? componentsPayload.components : [];
        const rowCount = Math.max(mustDos.length, componentRows.length, components.length);
        const rows = Array.from({ length: rowCount }, (_item, index) => {
            const componentRow = componentRows[index] || {};
            const mustDo = String(componentRow.mustDo || mustDos[index] || "");
            const component = String(componentRow.component || components[index] || "");
            return `
            <tr>
                <td>${escapeHtml(mustDo)}</td>
                <td>${escapeHtml(component)}</td>
            </tr>
        `;
        }).join("");
        const tableHeading = developmentStepsId ? "MUST-DOs and Development Steps components" : "MUST-DOs from your Digital Outcome Description";
        const tableColumnHeading = developmentStepsId ? "Components" : "Development Steps";
        target.innerHTML = rowCount
            ? `<h3>${tableHeading}</h3><table class="digital-outcome-must-dos-table"><thead><tr><th>MUST-DOs</th><th>${tableColumnHeading}</th></tr></thead><tbody>${rows}</tbody></table><p class="task-topic-submission-note">Last read: ${escapeHtml(formatSubmissionTimestamp(componentsPayload?.syncedAt || mustDosPayload?.syncedAt || ""))}</p>`
            : `<p class="task-topic-submission-note">No MUST-DO bullet points were found in the linked Digital Outcome Description slide yet.</p>`;
    }).catch((error) => {
        target.innerHTML = `<p class="task-topic-submission-note is-error">${escapeHtml(error?.message || "Could not read the slideshow.")}</p>`;
    });
}

async function renderTriallingComponentsTable(host, projectId, email) {
    const target = host?.querySelector("#trialling-components-table");
    if (!target) return;

    let developmentStepsUrl = readStoredTaskTopicSlideSyncEntryByTemplateId(projectId, email, "development-steps")?.url
        || readStoredTaskTopicSlideSyncEntryByShortName(projectId, email, "Development Steps")?.url
        || "";
    if (!developmentStepsUrl) {
        developmentStepsUrl = (await findProcessAssessmentSlideMatch("Development Steps")).fileUrl;
    }

    const developmentStepsId = extractSlidesIdFromValue(developmentStepsUrl);
    const driveAccessToken = readStoredHubDriveAccessToken();
    if (!driveAccessToken || !developmentStepsId) {
        target.innerHTML = `<p class="task-topic-submission-note">Link your Development Steps slideshow to load the components you have listed.</p>`;
        return;
    }

    target.innerHTML = `<p class="task-topic-submission-note">Reading components from your Development Steps slideshow...</p>`;
    try {
        const response = await fetch("/api/student/drive-setup/read-development-components", {
            method: "POST",
            headers: buildWriteHeaders(),
            body: JSON.stringify({ driveAccessToken, presentationId: developmentStepsId })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Could not read the Development Steps slideshow.");

        const componentRows = Array.isArray(payload?.rows) ? payload.rows : [];
        const components = componentRows.length
            ? componentRows.map((row) => ({
                component: String(row?.component || "").trim(),
                toolsTechniques: String(row?.toolsTechniques || "").trim(),
                whyNeeded: String(row?.whyNeeded || "").trim()
            })).filter((row) => row.component || row.toolsTechniques || row.whyNeeded)
            : (Array.isArray(payload?.components) ? payload.components.map((component) => String(component || "").trim()).filter(Boolean) : []);
        const normalizedComponents = components.map((row) => typeof row === "string"
            ? { component: row, toolsTechniques: "", whyNeeded: "" }
            : row);
        const rows = normalizedComponents.map((row) => `<tr><td>${escapeHtml(row.component)}</td><td>${escapeHtml(row.toolsTechniques)}</td></tr>`).join("");
        target.innerHTML = normalizedComponents.length
            ? `<h3>Components from Development Steps</h3><table class="digital-outcome-must-dos-table"><thead><tr><th>Components</th><th>Tools &amp; Techniques</th></tr></thead><tbody>${rows}</tbody></table><p class="task-topic-submission-note">Last read: ${escapeHtml(formatSubmissionTimestamp(payload?.syncedAt || ""))}</p>`
            : `<p class="task-topic-submission-note">No components have been listed in the linked Development Steps slideshow yet.</p>`;
    } catch (error) {
        target.innerHTML = `<p class="task-topic-submission-note is-error">${escapeHtml(error?.message || "Could not read the Development Steps slideshow.")}</p>`;
    }
}

async function renderTestingFunctionsLists(host, projectId, email) {
    const target = host?.querySelector("#testing-functions-lists");
    if (!target) return;

    let testingFunctionsUrl = readStoredTaskTopicSlideSyncEntryByTemplateId(projectId, email, "testing-functions")?.url
        || readStoredTaskTopicSlideSyncEntryByShortName(projectId, email, "Testing Functions")?.url
        || "";
    if (!testingFunctionsUrl) {
        testingFunctionsUrl = (await findProcessAssessmentSlideMatch("Testing Functions")).fileUrl;
    }
    const presentationId = extractSlidesIdFromValue(testingFunctionsUrl);
    const driveAccessToken = readStoredHubDriveAccessToken();
    const slideshowLink = testingFunctionsUrl
        ? `<p class="digital-outcome-must-dos-link"><a href="${escapeHtml(testingFunctionsUrl)}" target="_blank" rel="noreferrer">Open Testing Functions slideshow</a></p>`
        : "";
    if (!driveAccessToken || !presentationId) {
        target.innerHTML = `<p class="task-topic-submission-note">Link your Testing Functions slideshow to load the tests you have recorded.</p>`;
        return;
    }

    target.innerHTML = `${slideshowLink}<p class="task-topic-submission-note">Reading your Functional Testing and User Testing lists...</p>`;
    try {
        const response = await fetch("/api/student/drive-setup/read-testing-functions", {
            method: "POST",
            headers: buildWriteHeaders(),
            body: JSON.stringify({ driveAccessToken, presentationId })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || "Could not read the Testing Functions slideshow.");

        const functionalItems = (Array.isArray(payload?.functionalTesting) ? payload.functionalTesting : [])
            .map((value) => String(value || "").trim()).filter(Boolean);
        const userItems = (Array.isArray(payload?.userTesting) ? payload.userTesting : [])
            .map((value) => String(value || "").trim()).filter(Boolean);
        writeStoredTestingFunctionsListCounts(projectId, email, {
            functionalCount: functionalItems.length,
            userCount: userItems.length,
            savedAt: payload?.syncedAt || new Date().toISOString()
        });
        const renderListTable = (title, items) => items.length
            ? `<h3>${title}</h3><table class="digital-outcome-must-dos-table"><thead><tr><th>What I will test</th></tr></thead><tbody>${items.map((item) => `<tr><td>${escapeHtml(item)}</td></tr>`).join("")}</tbody></table>`
            : `<h3>${title}</h3><p class="task-topic-submission-note">No ${title.toLowerCase()} items have been recorded in your slideshow yet.</p>`;
        target.innerHTML = `${slideshowLink}${renderListTable("Functional Testing", functionalItems)}${renderListTable("User Testing", userItems)}<p class="task-topic-submission-note">Last read: ${escapeHtml(formatSubmissionTimestamp(payload?.syncedAt || ""))}</p>`;
    } catch (error) {
        target.innerHTML = `${slideshowLink}<p class="task-topic-submission-note is-error">${escapeHtml(error?.message || "Could not read the Testing Functions slideshow.")}</p>`;
    }
}

function getTestingFunctionsListCountStorageKey(projectId, email) {
    return `${TESTING_FUNCTIONS_LIST_COUNT_STORAGE_PREFIX}:${String(projectId || "").trim()}:${String(email || "").trim().toLowerCase()}`;
}

function writeStoredTestingFunctionsListCounts(projectId, email, counts) {
    if (!projectId || !email) return;
    try {
        localStorage.setItem(getTestingFunctionsListCountStorageKey(projectId, email), JSON.stringify(counts || {}));
    } catch (_error) {
    }
    void persistTestingFunctionsCounts(projectId, email, counts);
}

async function persistTestingFunctionsCounts(projectId, studentEmail, counts) {
    const functionalCount = Math.max(0, Number.parseInt(counts?.functionalCount, 10) || 0);
    const userCount = Math.max(0, Number.parseInt(counts?.userCount, 10) || 0);
    if (!projectId || !studentEmail) return;
    try {
        const rows = await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
        const standard = "testing-functions-counts";
        const nextRows = rows.filter((row) => String(row?.standard || "").trim() !== standard);
        nextRows.push({
            standard,
            steps: [{ text: `TESTING_FUNCTIONS_COUNT|${functionalCount}|${userCount}`, done: functionalCount + userCount > 0 }]
        });
        await saveEvidenceRows(projectId, studentEmail, nextRows);
    } catch (_error) {
    }
}

async function renderTaskTopicSubmissionPanel({ host, projectId, detailData, email, isTeacher, interestData }) {
    const panelHost = host?.querySelector("#task-topic-submission-live-panel");
    if (!panelHost) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const taskTopicTitle = String(params.get("taskTopic") || "").trim();
    const taskTopicShortName = String(params.get("taskShortName") || "").trim();
    if (!taskTopicTitle) {
        panelHost.innerHTML = "";
        return;
    }

    if (!email) {
        panelHost.innerHTML = `<p class="task-topic-submission-note">Sign in to submit your evidence for this task topic.</p>`;
        return;
    }

    const standardNumber = extractPrimaryStandardNumberFromRows(coerceArray(detailData?.standardDetails));
    const standardKey = buildTaskTopicSubmissionStandardKey(taskTopicTitle, standardNumber);
    const isRelevantImplicationsTopic = taskTopicTitle.toLowerCase().includes("relevant implication");
    const normalizedDerivedShortName = deriveTaskShortName(taskTopicTitle).toLowerCase();
    const normalizedTaskTopicShortName = taskTopicShortName.toLowerCase();
    const keywordMatchedTopicKey = inferDigitalOutcomeTopicKeyFromTitle(`${taskTopicTitle} ${taskTopicShortName}`);
    const isProjectManagementTopic = taskTopicTitle.toLowerCase().includes("project management")
        || normalizedTaskTopicShortName.includes("project management")
        || normalizedDerivedShortName.includes("project management");

    // Keep Project Management task-topic cards focused on card content.
    // Submission tracking is available on the main Assessment Task page.
    if (isProjectManagementTopic) {
        panelHost.innerHTML = "";
        return;
    }

    const isAssetVersionControlTopic = taskTopicTitle.toLowerCase().includes("asset management")
        || taskTopicTitle.toLowerCase().includes("version control")
        || normalizedTaskTopicShortName.includes("asset management")
        || normalizedTaskTopicShortName.includes("version control")
        || normalizedDerivedShortName.includes("asset management")
        || normalizedDerivedShortName.includes("version control");
    const isDecompositionTopic = taskTopicTitle.toLowerCase().includes("decompos")
        || normalizedTaskTopicShortName.includes("decompos")
        || normalizedDerivedShortName.includes("decompos");
    const isDigitalOutcomeTopic = taskTopicTitle.toLowerCase().includes("digital outcome")
        || normalizedTaskTopicShortName.includes("digital outcome")
        || normalizedDerivedShortName.includes("digital outcome")
        || isDigitalOutcomeTargetAudienceCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
        || isDigitalOutcomeDevelopmentToolsCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
        || isDigitalOutcomeTriallingComponentsCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
        || isDigitalOutcomeTestingFunctionsCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
        || isDigitalOutcomeRelevantDigiMedConventionsCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
        || isToolsAndTechniquesCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
        || isUseOfToolsTechniquesCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
        || isDigitalOutcomeSuccessCriteriaCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
        || Boolean(keywordMatchedTopicKey);
    if (isDigitalOutcomeDescriptionTopic) {
        panelHost.innerHTML = "";
        return;
    }
    const digitalOutcomeSyncTemplateId = keywordMatchedTopicKey === "target-audience"
        ? "target-audience"
        : (keywordMatchedTopicKey === "trialling-components"
            ? "trialling-components"
        : (keywordMatchedTopicKey === "development-steps"
            ? "development-steps"
            : (keywordMatchedTopicKey === "success-criteria" ? "project-success-criteria" : "digital-outcome-description")));
    const isMediaAssetWorkflowTopic = isAssetVersionControlTopic && !isProjectManagementTopic;
    const isTrackedWorkflowTopic = isProjectManagementTopic || isMediaAssetWorkflowTopic;

    if (isTeacher) {
        const students = Array.isArray(interestData?.students) ? interestData.students : [];
        if (!students.length) {
            panelHost.innerHTML = `<p class="task-topic-submission-note">No allocated students yet. Add or confirm a student first, then evidence submission statuses will appear here.</p>`;
            return;
        }

        const trelloConnectionByEmail = new Map();
        if (isProjectManagementTopic) {
            const emails = students
                .map((student) => String(student?.email || "").trim().toLowerCase())
                .filter(Boolean);
            if (emails.length) {
                try {
                    const response = await fetch(`/api/integrations/trello/connections?emails=${encodeURIComponent(emails.join(","))}`, {
                        headers: buildWriteHeaders()
                    });
                    if (response.ok) {
                        const payload = await response.json().catch(() => ({}));
                        const rows = Array.isArray(payload?.connections) ? payload.connections : [];
                        rows.forEach((row) => {
                            const email = String(row?.email || "").trim().toLowerCase();
                            if (!email) return;
                            trelloConnectionByEmail.set(email, Boolean(row?.connected));
                        });
                    }
                } catch (_error) {
                    // Fallback for environments without the bulk endpoint yet.
                    await Promise.all(emails.map(async (studentEmail) => {
                        try {
                            const statusResponse = await fetch("/api/integrations/trello/status", {
                                headers: { "x-user-email": studentEmail }
                            });
                            if (!statusResponse.ok) {
                                return;
                            }

                            const statusPayload = await statusResponse.json().catch(() => ({}));
                            trelloConnectionByEmail.set(studentEmail, Boolean(statusPayload?.connected));
                        } catch (_statusError) {
                            // Ignore individual lookup failures.
                        }
                    }));
                }
            }
        }

        const rows = students
            .map((student) => {
                const studentEmail = String(student?.email || "").trim().toLowerCase();
                if (!studentEmail) {
                    return null;
                }

                const submission = parseTaskTopicSubmissionFromEvidenceRows(student?.evidence_steps, standardKey);
                return {
                    email: studentEmail,
                    name: deriveDisplayNameFromEmail(studentEmail),
                    acknowledged: Boolean(submission.haparaAcknowledged),
                    submittedAt: submission.haparaSubmittedAt || submission.submittedAt || "",
                    googleSlidesUrl: toSafeExternalUrl(submission.googleSlidesUrl || submission.evidenceLink),
                    trelloCardUrl: submission.trelloCardUrl || "",
                    trelloConnected: Boolean(trelloConnectionByEmail.get(studentEmail)),
                    mediaAssetFolderUrl: submission.mediaAssetFolderUrl || "",
                    mediaReviewUrl: submission.mediaReviewUrl || "",
                    docRef: submission.haparaDocumentRef || "",
                    lastLogDate: String(submission.trelloLastLogDate || "").trim(),
                    lastLogAt: String(submission.trelloLastLogAt || "").trim(),
                    mediaLastVersionLogDate: String(submission.mediaVersionLogDate || "").trim(),
                    mediaLastVersionLogAt: String(submission.mediaVersionLogAt || "").trim()
                };
            })
            .filter(Boolean);

        const todayNz = getNzDateKey();
        const missingPrimaryLinkRows = rows.filter((row) => {
            if (isProjectManagementTopic) {
                return !String(row.trelloCardUrl || "").trim() && !row.trelloConnected;
            }
            if (isMediaAssetWorkflowTopic) {
                return !String(row.mediaAssetFolderUrl || "").trim();
            }
            return false;
        });
        const missingLogRows = rows.filter((row) => {
            if (isProjectManagementTopic) {
                return row.lastLogDate !== todayNz;
            }
            if (isMediaAssetWorkflowTopic) {
                return row.mediaLastVersionLogDate !== todayNz;
            }
            return false;
        });
        const loggedTodayCount = rows.filter((row) => {
            if (isProjectManagementTopic) {
                return row.lastLogDate === todayNz;
            }
            if (isMediaAssetWorkflowTopic) {
                return row.mediaLastVersionLogDate === todayNz;
            }
            return false;
        }).length;
        const summaryPrimaryLabel = isProjectManagementTopic ? "Missing Trello Link" : "Missing Asset Folder Link";
        const summaryLogLabel = isProjectManagementTopic ? "Missing Today's Log" : "Missing Today's Version Log";
        const logCompleteText = isProjectManagementTopic ? "Logged today" : "Version log updated today";
        const logMissingText = isProjectManagementTopic ? "Missing today's log" : "Missing today's version log";

        if (!rows.length) {
            panelHost.innerHTML = `<p class="task-topic-submission-note">No student records are ready for evidence progress tracking yet.</p>`;
            return;
        }

        panelHost.innerHTML = `
            <div class="task-topic-submission-teacher-panel">
                <p class="task-topic-submission-note">Students connect evidence for this task topic. This panel tracks completed evidence and linked work.</p>
                <div class="task-topic-submission-meta">
                    <p><strong>Complete:</strong> ${rows.filter((row) => row.acknowledged).length} of ${rows.length}</p>
                    ${isTrackedWorkflowTopic ? `<p><strong>Logged today:</strong> ${loggedTodayCount} of ${rows.length}</p>` : ""}
                </div>
                ${isTrackedWorkflowTopic ? `
                    <div class="task-topic-teacher-summary-row">
                        <div class="task-topic-teacher-summary-item">
                            <span class="task-topic-teacher-summary-label">${escapeHtml(summaryPrimaryLabel)}</span>
                            <span class="task-topic-teacher-summary-value">${missingPrimaryLinkRows.length}</span>
                        </div>
                        <div class="task-topic-teacher-summary-item">
                            <span class="task-topic-teacher-summary-label">${escapeHtml(summaryLogLabel)}</span>
                            <span class="task-topic-teacher-summary-value">${missingLogRows.length}</span>
                        </div>
                        <div class="task-topic-teacher-summary-action">
                            <button type="button" class="detail-action detail-action-secondary" id="task-topic-export-missing-log">Export Missing Logs</button>
                        </div>
                    </div>
                ` : ""}
                ${isTrackedWorkflowTopic ? `
                    <div class="task-topic-submission-actions task-topic-teacher-filter-actions">
                        <button type="button" class="detail-action detail-action-secondary" id="task-topic-filter-missing-trello">${isProjectManagementTopic ? "Show Missing Trello Links" : "Show Missing Asset Folder Links"}</button>
                        <button type="button" class="detail-action detail-action-secondary" id="task-topic-filter-missing-log">${isProjectManagementTopic ? "Show Missing Today's Log" : "Show Missing Today's Version Log"}</button>
                        <button type="button" class="detail-action detail-action-secondary" id="task-topic-filter-show-all" hidden>Show All Students</button>
                    </div>
                ` : ""}
                <div class="task-topic-teacher-status-list">
                    ${rows.map((row) => `
                        <div class="task-topic-teacher-status-item">
                            <span class="task-topic-teacher-status-email">${escapeHtml(row.name)}</span>
                            <span class="task-topic-teacher-status-email">${escapeHtml(row.email)}</span>
                            <span class="task-topic-teacher-status-pill ${row.acknowledged ? "is-acknowledged" : "is-pending"}">${row.acknowledged ? "Evidence complete" : "Evidence required"}</span>
                            <span class="task-topic-teacher-status-doc">${escapeHtml(row.docRef || "No document reference")}</span>
                            ${isDigitalOutcomeTopic
                                ? (row.googleSlidesUrl
                                    ? `<a class="task-topic-teacher-status-trello" href="${escapeHtml(row.googleSlidesUrl)}" target="_blank" rel="noreferrer">Open Google Slides</a>`
                                    : `<span class="task-topic-teacher-status-trello task-topic-teacher-status-trello-missing">No Google Slides link</span>`
                                )
                                : ""
                            }
                            ${isProjectManagementTopic
                                ? (row.trelloCardUrl
                                    ? `<a class="task-topic-teacher-status-trello" href="${escapeHtml(row.trelloCardUrl)}" target="_blank" rel="noreferrer">Open Trello Card</a>`
                                    : (row.trelloConnected
                                        ? `<span class="task-topic-teacher-status-trello">Trello connected</span>`
                                        : `<span class="task-topic-teacher-status-trello task-topic-teacher-status-trello-missing">No Trello card linked</span>`
                                    )
                                )
                                : (isMediaAssetWorkflowTopic
                                    ? (row.mediaAssetFolderUrl
                                        ? `<a class="task-topic-teacher-status-trello" href="${escapeHtml(row.mediaAssetFolderUrl)}" target="_blank" rel="noreferrer">Open Asset Folder</a>`
                                        : `<span class="task-topic-teacher-status-trello task-topic-teacher-status-trello-missing">No asset folder linked</span>`
                                    )
                                    : ""
                                )
                            }
                            ${isMediaAssetWorkflowTopic && row.mediaReviewUrl
                                ? `<a class="task-topic-teacher-status-trello" href="${escapeHtml(row.mediaReviewUrl)}" target="_blank" rel="noreferrer">Open Review Link</a>`
                                : ""
                            }
                            <a class="task-topic-teacher-status-trello" href="${escapeHtml(`../asset-manager.html?id=${encodeURIComponent(projectId)}&studentEmail=${encodeURIComponent(row.email)}`)}" target="_blank" rel="noreferrer">Asset Manager</a>
                            ${isTrackedWorkflowTopic
                                ? `<span class="task-topic-teacher-status-log ${(isProjectManagementTopic ? row.lastLogDate : row.mediaLastVersionLogDate) === todayNz ? "is-complete" : "is-missing"}">${(isProjectManagementTopic ? row.lastLogDate : row.mediaLastVersionLogDate) === todayNz ? logCompleteText : logMissingText}</span>`
                                : ""
                            }
                            <span class="task-topic-teacher-status-time">Evidence recorded: ${escapeHtml(formatSubmissionTimestamp(row.submittedAt))}</span>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;

        if (isTrackedWorkflowTopic) {
            const missingFilterButton = panelHost.querySelector("#task-topic-filter-missing-trello");
            const missingLogFilterButton = panelHost.querySelector("#task-topic-filter-missing-log");
            const showAllButton = panelHost.querySelector("#task-topic-filter-show-all");
            const exportMissingLogButton = panelHost.querySelector("#task-topic-export-missing-log");
            const items = Array.from(panelHost.querySelectorAll(".task-topic-teacher-status-item"));

            const applyFilter = (mode) => {
                items.forEach((item) => {
                    const hasMissingBadge = Boolean(item.querySelector(".task-topic-teacher-status-trello-missing"));
                    const hasMissingLog = Boolean(item.querySelector(".task-topic-teacher-status-log.is-missing"));
                    if (mode === "missing-trello") {
                        item.hidden = !hasMissingBadge;
                    } else if (mode === "missing-log") {
                        item.hidden = !hasMissingLog;
                    } else {
                        item.hidden = false;
                    }
                });

                if (missingFilterButton) {
                    missingFilterButton.hidden = mode === "missing-trello";
                }
                if (missingLogFilterButton) {
                    missingLogFilterButton.hidden = mode === "missing-log";
                }
                if (showAllButton) {
                    showAllButton.hidden = mode === "all";
                }
            };

            missingFilterButton?.addEventListener("click", () => applyFilter("missing-trello"));
            missingLogFilterButton?.addEventListener("click", () => applyFilter("missing-log"));
            showAllButton?.addEventListener("click", () => applyFilter("all"));

            exportMissingLogButton?.addEventListener("click", () => {
                const rowsToExport = rows.filter((row) => {
                    if (isProjectManagementTopic) {
                        return row.lastLogDate !== todayNz;
                    }
                    if (isMediaAssetWorkflowTopic) {
                        return row.mediaLastVersionLogDate !== todayNz;
                    }
                    return false;
                });
                const quoteCsv = (value) => `"${String(value || "").replace(/"/g, '""')}"`;
                const csvLines = [
                    ["student_email", "acknowledged", "trello_linked", "asset_folder_linked", "last_log_date", "last_log_at", "review_link", "document_reference"].join(","),
                    ...rowsToExport.map((row) => [
                        quoteCsv(row.email),
                        quoteCsv(row.acknowledged ? "yes" : "no"),
                        quoteCsv(row.trelloCardUrl || row.trelloConnected ? "yes" : "no"),
                        quoteCsv(row.mediaAssetFolderUrl ? "yes" : "no"),
                        quoteCsv(isProjectManagementTopic ? (row.lastLogDate || "") : (row.mediaLastVersionLogDate || "")),
                        quoteCsv(isProjectManagementTopic ? (row.lastLogAt || "") : (row.mediaLastVersionLogAt || "")),
                        quoteCsv(row.mediaReviewUrl || ""),
                        quoteCsv(row.docRef || "")
                    ].join(","))
                ];

                const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `missing-todays-log-${todayNz}.csv`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
            });
        }
        return;
    }

    const hasAllocation = Boolean(interestData?.my_interest || interestData?.my_allocation);
    if (!hasAllocation) {
        panelHost.innerHTML = `<p class="task-topic-submission-note">Select <strong>I'm Interested</strong> first, then you can submit your evidence for this task topic.</p>`;
        return;
    }

    let evidenceRows = [];
    try {
        evidenceRows = await fetchEvidenceRows(projectId, email);
    } catch (_error) {
        panelHost.innerHTML = `<p class="task-topic-submission-note">Could not load your submission right now. Try again shortly.</p>`;
        return;
    }

    const submission = parseTaskTopicSubmissionFromEvidenceRows(evidenceRows, standardKey);
    const haparaSpaceName = String(submission.haparaLocation || "").trim();
    const haparaClassDriveUrl = String(submission.haparaDriveClassUrl || "").trim();
    const acknowledged = Boolean(submission.haparaAcknowledged);
    const acknowledgedAt = submission.haparaSubmittedAt || submission.submittedAt || "";
    const currentDocRef = String(submission.haparaDocumentRef || "").trim();
    const currentGoogleSlidesUrl = toSafeExternalUrl(submission.googleSlidesUrl || submission.evidenceLink);
    const storedSyncEntry = readStoredTaskTopicSlideSyncEntry(projectId, email, taskTopicTitle, taskTopicShortName);
    const storedSyncSource = String(storedSyncEntry?.syncSource || "").trim().toLowerCase();
    // Only use stored sync if it's from student action (template-use or folder-match), not teacher preview (manual-link)
    const shouldUseStoredSync = storedSyncEntry.url && storedSyncSource !== "manual-link";
    let syncedGoogleSlidesUrl = shouldUseStoredSync ? storedSyncEntry.url : currentGoogleSlidesUrl;
    let syncedGoogleSlidesSavedAt = String(storedSyncEntry.savedAt || "").trim();
    const currentTrelloCardUrl = toSafeTrelloCardUrl(submission.trelloCardUrl);
    const favouriteTrelloBoardUrl = getFavouriteTrelloCardLibraryLink(projectId, email);
    const storedTrelloBoardUrl = toSafeTrelloCardUrl(readStoredTrelloCardLink(projectId, email))
        || toSafeTrelloCardUrl(readStoredTrelloCardLibrary(projectId, email)[0]?.url || "");
    // A starred Favourite always wins when multiple Trello links are synced, so the Decomposition board knows which one to show.
    let currentDecompositionTrelloUrl = favouriteTrelloBoardUrl
        || currentTrelloCardUrl
        || getFirstTrelloCardUrlFromEvidenceRows(evidenceRows)
        || storedTrelloBoardUrl;
    const currentMediaAssetFolderUrl = toSafeExternalUrl(submission.mediaAssetFolderUrl);
    const currentOneDriveProjectFolderUrl = toSafeExternalUrl(submission.mediaAssetFolderUrl);
    const currentMediaReviewUrl = toSafeExternalUrl(submission.mediaReviewUrl);
    const currentDecompositionSteps = Array.isArray(submission.decompositionSteps) ? submission.decompositionSteps : [];
    const decompositionTextValue = currentDecompositionSteps.join("\n");
    const todayNz = getNzDateKey();
    const studentInitials = deriveInitialsFromEmail(email);
    const mediaFileExample = `client-project_asset-type_v03_${todayNz}_${studentInitials}.ext`;
    const hasLoggedToday = isProjectManagementTopic
        ? String(submission.trelloLastLogDate || "").trim() === todayNz
        : isMediaAssetWorkflowTopic
            ? String(submission.mediaVersionLogDate || "").trim() === todayNz
            : false;

    if (isDigitalOutcomeTopic) {
        const processAssessmentFolderUrl = await fetchStudentProcessAssessmentFolderUrl();
        const isTargetAudienceTopic = isDigitalOutcomeTargetAudienceCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
            || keywordMatchedTopicKey === "target-audience";
        const isToolsAndTechniquesSyncTopic = isToolsAndTechniquesCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
            || keywordMatchedTopicKey === "tools-and-techniques";
        const isDevelopmentToolsTopic = !isToolsAndTechniquesSyncTopic && (
            isDigitalOutcomeDevelopmentToolsCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
            || keywordMatchedTopicKey === "development-steps");
        const isTriallingComponentsTopic = isDigitalOutcomeTriallingComponentsCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
            || keywordMatchedTopicKey === "trialling-components";
        const isTestingFunctionsTopic = isDigitalOutcomeTestingFunctionsCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
            || keywordMatchedTopicKey === "testing-functions";
        const isRelevantDigiMedConventionsTopic = isDigitalOutcomeRelevantDigiMedConventionsCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
            || keywordMatchedTopicKey === "relevant-digimed-conventions";
        const isUXPrinciplesTopic = isDigitalOutcomeUXPrinciplesCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
            || keywordMatchedTopicKey === "user-experience-principles";
        const isSuccessCriteriaTopic = isDigitalOutcomeSuccessCriteriaCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
            || keywordMatchedTopicKey === "success-criteria";
        const isRelevantImplicationsTopic = isDigitalOutcomeRelevantImplicationsCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle))
            || keywordMatchedTopicKey === "relevant-implications";
        const isUseOfToolsTechniquesSyncTopic = isUseOfToolsTechniquesCriterion(taskTopicTitle, taskTopicShortName || deriveTaskShortName(taskTopicTitle));
        const syncTopicLabel = isUseOfToolsTechniquesSyncTopic
            ? USE_OF_TOOLS_TECHNIQUES_TEMPLATE_TITLE
            : isTargetAudienceTopic
            ? DIGITAL_OUTCOME_TARGET_AUDIENCE_TITLE
            : (isToolsAndTechniquesSyncTopic
                ? DIGITAL_OUTCOME_TOOLS_TECHNIQUES_TITLE
                : (isDevelopmentToolsTopic
                    ? DIGITAL_OUTCOME_DEVELOPMENT_TOOLS_TITLE
                    : (isTriallingComponentsTopic
                        ? DIGITAL_OUTCOME_TRIALLING_COMPONENTS_TITLE
                    : (isRelevantDigiMedConventionsTopic
                        ? DIGITAL_OUTCOME_RELEVANT_DIGIMED_CONVENTIONS_TITLE
                    : (isUXPrinciplesTopic
                        ? DIGITAL_OUTCOME_UX_PRINCIPLES_TITLE
                    : (isSuccessCriteriaTopic
                        ? DIGITAL_OUTCOME_SUCCESS_CRITERIA_TITLE
                        : (isRelevantImplicationsTopic ? DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_TITLE : "Digital Outcome: Description")))))));
        const syncTemplateId = isUseOfToolsTechniquesSyncTopic
            ? "use-of-tools-and-techniques"
            : isTargetAudienceTopic
            ? "target-audience"
            : (isToolsAndTechniquesSyncTopic
                ? "tools-and-techniques"
                : (isDevelopmentToolsTopic
                    ? "development-steps"
                    : (isTriallingComponentsTopic
                        ? "trialling-components"
                        : (isTestingFunctionsTopic
                            ? "testing-functions"
                            : (isRelevantDigiMedConventionsTopic
                                ? "relevant-digimed-conventions"
                                : (isUXPrinciplesTopic
                                    ? "user-experience-principles"
                                    : (isSuccessCriteriaTopic
                        ? "project-success-criteria"
                                : (isRelevantImplicationsTopic ? "relevant-implications" : "digital-outcome-description"))))))));
        const allowFolderMatchAutoLink = syncTemplateId === "digital-outcome-description"
            || syncTemplateId === "target-audience"
            || syncTemplateId === "development-steps"
            || syncTemplateId === "trialling-components"
            || syncTemplateId === "project-success-criteria"
            || syncTemplateId === "relevant-implications"
            || syncTemplateId === "tools-and-techniques"
            || syncTemplateId === "use-of-tools-and-techniques";

        // For staged rollout, do not pre-connect Relevant Implications (or other non-enabled pages)
        // from passive folder matches when the student has not explicitly linked/downloaded.
        if (!allowFolderMatchAutoLink && !currentGoogleSlidesUrl) {
            const isPassiveStoredLink = Boolean(storedSyncEntry?.url)
                && (storedSyncSource === "folder-match" || !storedSyncSource);
            if (isPassiveStoredLink) {
                syncedGoogleSlidesUrl = "";
                syncedGoogleSlidesSavedAt = "";
            }
        }

        const canonicalTemplatePreviewUrl = await fetchTemplateLibraryPreviewByTemplateId(syncTemplateId)
            || (isToolsAndTechniquesSyncTopic ? DIGITAL_OUTCOME_TOOLS_TECHNIQUES_TEMPLATE_PREVIEW_URL : "");
        if (!syncedGoogleSlidesSavedAt) {
            syncedGoogleSlidesSavedAt = String(submission.haparaSubmittedAt || submission.submittedAt || "").trim();
        }
        if (canonicalTemplatePreviewUrl) {
            updateTaskTopicTemplateHeroPreview(host, canonicalTemplatePreviewUrl, syncTopicLabel, canonicalTemplatePreviewUrl);
        } else if (isToolsAndTechniquesSyncTopic && !isTriallingComponentsTopic) {
            // No template available yet — show placeholder text in hero rather than a wrong image
            updateTaskTopicTemplateHeroPreviewNoTemplate(host, syncTopicLabel);
        }

        panelHost.innerHTML = `
            <div class="task-topic-sync-only-panel" aria-label="Digital Outcome sync links">
                <p class="task-topic-submission-note task-topic-sync-only-note">Showing synced Google links for <strong>${escapeHtml(syncTopicLabel)}</strong>.</p>
                ${processAssessmentFolderUrl
                    ? `<p class="task-topic-sync-folder-link"><a href="${escapeHtml(processAssessmentFolderUrl)}" target="_blank" rel="noreferrer">Open Process Assessment folder in Google Drive</a></p>`
                    : ""
                }
                ${syncedGoogleSlidesUrl
                    ? `
                        <ul class="task-topic-sync-link-list" aria-label="Synced slide links">
                            <li class="task-topic-sync-link-item">
                                <div class="task-topic-sync-link-main">
                                    <p class="task-topic-sync-link-title">${escapeHtml(syncTopicLabel)} slide deck</p>
                                    <a href="${escapeHtml(syncedGoogleSlidesUrl)}" target="_blank" rel="noreferrer">${escapeHtml(syncedGoogleSlidesUrl)}</a>
                                </div>
                                <div class="task-topic-sync-link-meta">
                                    <span class="task-topic-sync-created-label">Created Date</span>
                                    <span class="task-topic-sync-created-value">${escapeHtml(formatSyncCreatedDate(syncedGoogleSlidesSavedAt))}</span>
                                </div>
                            </li>
                        </ul>
                    `
                    : `<p class="task-topic-submission-note">No synced ${escapeHtml(syncTopicLabel)} slide link yet. Open Template Library and use the Digital Outcome template first.</p>`
                }
            </div>
        `;
        return;
    }

    panelHost.innerHTML = `
        <form id="task-topic-submission-form" class="task-topic-submission-form" novalidate>
            ${isDecompositionTopic ? "" : `
            <p class="task-topic-submission-note">Link your evidence below, then submit so your teacher can verify completion.</p>
            <p class="task-topic-submission-note">When all parts are ready, go to <a href="/hapara-submission.html" target="_blank" rel="noreferrer">Hapara Submission Checklist</a> to submit each item in one place.</p>

            <label class="task-topic-submission-label" for="task-topic-hapara-doc-ref">Evidence Note (Optional)</label>
            <input id="task-topic-hapara-doc-ref" class="task-topic-submission-input" type="text" placeholder="Example: Slide deck draft 2" value="${escapeHtml(currentDocRef)}">
            `}

            ${isDigitalOutcomeTopic ? `
                <p class="task-topic-submission-note task-topic-google-sync-note"><strong>Synced Slide:</strong> <span id="task-topic-google-slides-sync-reference">${syncedGoogleSlidesUrl ? `<a href="${escapeHtml(syncedGoogleSlidesUrl)}" target="_blank" rel="noreferrer">${escapeHtml(syncedGoogleSlidesUrl)}</a>` : "No synced slide yet. Open Template Library and click Use Template to link your personal slide copy."}</span></p>
                
                ${storedSyncEntry.url && storedSyncEntry.syncSource === "template-use" && topicMatch.fileUrl ? `
                    <div class="task-topic-student-template-section">
                        <p class="task-topic-submission-label">Your Template Selection</p>
                        <div class="task-topic-template-card">
                            ${storedSyncEntry.thumbnailUrl ? `
                                <div class="task-topic-template-thumbnail">
                                    <a href="${escapeHtml(storedSyncEntry.url)}" target="_blank" rel="noreferrer">
                                        <img src="${escapeHtml(storedSyncEntry.thumbnailUrl)}" alt="${escapeHtml(storedSyncEntry.templateTitle || "Template preview")}" />
                                    </a>
                                </div>
                            ` : ""}
                            <div class="task-topic-template-details">
                                <h4 class="task-topic-template-title">${escapeHtml(storedSyncEntry.templateTitle || "Selected Template")}</h4>
                                <p class="task-topic-template-meta">
                                    <span class="task-topic-template-label">Selected:</span>
                                    <span class="task-topic-template-date">${escapeHtml(formatSyncCreatedDate(storedSyncEntry.savedAt))}</span>
                                </p>
                                <a href="${escapeHtml(storedSyncEntry.url)}" target="_blank" rel="noreferrer" class="task-topic-template-link">Open in Google Drive →</a>
                            </div>
                        </div>
                    </div>
                ` : ""}
                
                <label class="task-topic-submission-label" for="task-topic-google-slides-url">Digital Outcome Description - Google Slides Link</label>
                <input id="task-topic-google-slides-url" class="task-topic-submission-input" type="url" placeholder="https://docs.google.com/presentation/..." value="${escapeHtml(currentGoogleSlidesUrl)}" required>
                <p class="task-topic-submission-note">Create a Google Slideshow and include at least one slide that clearly describes the digital outcome.</p>
                <p class="task-topic-submission-note">For a clear intent statement, explain: what the idea is, why it should exist, who it is for, and what success looks like.</p>
            ` : ""}

            ${isProjectManagementTopic ? `
                <label class="task-topic-submission-label" for="task-topic-trello-card-url">Trello Card or Board Link</label>
                <input id="task-topic-trello-card-url" class="task-topic-submission-input" type="url" placeholder="https://trello.com/c/xxxx1234 or /b/xxxx/board-name" value="${escapeHtml(currentTrelloCardUrl)}" required>
                <p class="task-topic-submission-note">Project Management evidence requires your Trello card or board link. This gives your teacher one-click access for marking.</p>

                <label class="task-topic-submission-label" for="task-topic-onedrive-folder-url">OneDrive Project Folder Link</label>
                <input id="task-topic-onedrive-folder-url" class="task-topic-submission-input" type="url" placeholder="https://onedrive.live.com/... or school OneDrive/SharePoint folder" value="${escapeHtml(currentOneDriveProjectFolderUrl)}" required>
                <p class="task-topic-submission-note">Create your project folder inside OneDrive Documents and link that folder here so DTECH HUB can track your version-control location.</p>
                <p class="task-topic-submission-note task-topic-onedrive-warning">Important: Downloads and Videos folders are not backed up to OneDrive. Save all project files in your OneDrive Documents project folder.</p>

                <div class="task-topic-trello-create-box">
                    <p class="task-topic-submission-note">Create a Trello card automatically (optional):</p>
                    <label class="task-topic-submission-label" for="task-topic-trello-board">Board</label>
                    <select id="task-topic-trello-board" class="task-topic-submission-input">
                        <option value="">Select board</option>
                    </select>
                    <label class="task-topic-submission-label" for="task-topic-trello-list">List</label>
                    <select id="task-topic-trello-list" class="task-topic-submission-input">
                        <option value="">Select list</option>
                    </select>
                    <button type="button" class="detail-action detail-action-secondary" id="task-topic-create-trello-card">Create Trello Card for This Task</button>
                    <p class="task-topic-submission-status" id="task-topic-trello-create-status" aria-live="polite"></p>
                </div>

                <div class="task-topic-trello-log-box">
                    <p class="task-topic-submission-note ${hasLoggedToday ? "task-topic-submission-note-success" : "task-topic-submission-note-warning"}">${hasLoggedToday ? "Trello work log complete for today." : "Daily prompt: log your project management progress in Trello now."}</p>
                    <label class="task-topic-submission-label" for="task-topic-trello-log-note">Today's Trello Work Log</label>
                    <textarea id="task-topic-trello-log-note" class="task-topic-submission-input task-topic-submission-textarea" placeholder="What did you complete today? What blocker did you hit? What is your next step before next lesson?"></textarea>
                    <button type="button" class="detail-action" id="task-topic-send-trello-log">Send Today's Log to Trello</button>
                    <p class="task-topic-submission-status" id="task-topic-trello-log-status" aria-live="polite"></p>
                </div>
            ` : ""}

            ${isMediaAssetWorkflowTopic ? `
                <label class="task-topic-submission-label" for="task-topic-media-asset-url">Master Asset Folder Link</label>
                <input id="task-topic-media-asset-url" class="task-topic-submission-input" type="url" placeholder="https://drive.google.com/... or OneDrive folder" value="${escapeHtml(currentMediaAssetFolderUrl)}" required>
                <p class="task-topic-submission-note">Asset Management evidence requires a shared folder link where your current media files are managed.</p>

                <label class="task-topic-submission-label" for="task-topic-media-review-url">Review Link (Optional)</label>
                <input id="task-topic-media-review-url" class="task-topic-submission-input" type="url" placeholder="https://frame.io/... or review board" value="${escapeHtml(currentMediaReviewUrl)}">

                <div class="task-topic-media-naming-panel" role="note" aria-label="Media naming convention guide">
                    <p class="task-topic-media-naming-title">File Naming Convention</p>
                    <p class="task-topic-media-naming-text">Use this format so assets sort cleanly and versions are easy to find:</p>
                    <p class="task-topic-media-naming-format">client-project_asset-type_v##_YYYY-MM-DD_initials.ext</p>
                    <ul class="task-topic-media-naming-list">
                        <li>Use two digits for version numbers: v01, v02, v03.</li>
                        <li>Use ISO date format: YYYY-MM-DD.</li>
                        <li>Keep names lowercase and use hyphens instead of spaces.</li>
                        <li>Store final exports in a final-exports folder inside your master asset folder.</li>
                    </ul>
                    <p class="task-topic-media-naming-example">Example: ${escapeHtml(mediaFileExample)}</p>
                </div>

                <div class="task-topic-trello-log-box">
                    <p class="task-topic-submission-note ${hasLoggedToday ? "task-topic-submission-note-success" : "task-topic-submission-note-warning"}">${hasLoggedToday ? "Version log complete for today." : "Daily prompt: add a version log entry for your media updates now."}</p>
                    <label class="task-topic-submission-label" for="task-topic-media-log-note">Today's Version Log</label>
                    <textarea id="task-topic-media-log-note" class="task-topic-submission-input task-topic-submission-textarea" placeholder="What asset changed today? Which version/file name did you produce? What feedback or next revision is planned?"></textarea>
                    <button type="button" class="detail-action" id="task-topic-save-media-log">Save Today's Version Log</button>
                    <p class="task-topic-submission-status" id="task-topic-media-log-status" aria-live="polite"></p>
                </div>
            ` : ""}

            ${isDecompositionTopic ? `
                <div class="task-topic-decomp-box">
                    <div class="task-topic-decomp-trello-sync" aria-label="Trello account and saved links">
                        <p class="task-topic-decomp-dashboard-kicker">Trello Sync</p>
                        <p class="task-topic-submission-note">Connect your Trello account here so your Decomposition Task Board can load automatically, without needing to visit User Profile.</p>
                        <p class="task-topic-decomp-last-synced" id="task-topic-decomp-last-synced">Last synced: not yet</p>

                        <div class="task-topic-decomp-category-coverage" aria-label="Task category coverage">
                            <p class="task-topic-decomp-category-title">Task Category Coverage <span class="task-topic-decomp-category-total" id="task-topic-decomp-category-total">(0 Trello tasks)</span></p>
                            <ul class="task-topic-decomp-category-list" id="task-topic-decomp-category-list"></ul>
                        </div>

                        <button type="button" class="detail-action detail-action-secondary" id="task-topic-decomp-connect-trello" hidden>Connect Trello Account</button>
                        <div class="task-topic-submission-actions">
                            <button type="button" class="detail-action task-topic-decomp-pdf-button" id="task-topic-decomp-save-pdf">Save Trello PDF to Drive</button>
                        </div>
                        <p class="task-topic-submission-status" id="task-topic-decomp-pdf-status" aria-live="polite"></p>
                        <p class="task-topic-submission-status" id="task-topic-decomp-connect-status" aria-live="polite"></p>
                        <div class="trello-link-library" id="task-topic-decomp-trello-link-library" hidden>
                            <p class="trello-link-library-title">Saved Trello Links <span class="trello-link-library-count" id="task-topic-decomp-trello-link-library-count">(0)</span></p>
                            <ul class="trello-link-library-list" id="task-topic-decomp-trello-link-library-list"></ul>
                        </div>
                    </div>

                    <div class="task-topic-decomp-planner" aria-label="Decomposition planner">
                        <p class="task-topic-submission-note">Plan your decomposition steps here. Save in DTECH first, then push the steps to your Trello To Do list.</p>
                        <label class="task-topic-submission-label" for="task-topic-decomp-steps">Decomposition Steps (one per line)</label>
                        <textarea id="task-topic-decomp-steps" class="task-topic-submission-input task-topic-submission-textarea" placeholder="Break the assessment into clear, checkable steps...">${escapeHtml(decompositionTextValue)}</textarea>

                        <label class="task-topic-submission-label" for="task-topic-decomp-board">Trello Board</label>
                        <select id="task-topic-decomp-board" class="task-topic-submission-input">
                            <option value="">Select board</option>
                        </select>

                        <label class="task-topic-submission-label" for="task-topic-decomp-list">Trello To Do List</label>
                        <select id="task-topic-decomp-list" class="task-topic-submission-input">
                            <option value="">Select list</option>
                        </select>

                        <div class="task-topic-submission-actions">
                            <button type="button" class="detail-action detail-action-secondary" id="task-topic-save-decomp-plan">Save Decomposition Plan</button>
                            <button type="button" class="detail-action" id="task-topic-push-decomp-trello">Push Steps to Trello To Do</button>
                        </div>
                        <p class="task-topic-submission-status" id="task-topic-decomp-status" aria-live="polite"></p>
                    </div>

                    <section class="task-topic-decomp-dashboard" aria-label="Decomposition task board">
                        <div class="task-topic-decomp-dashboard-heading">
                            <div>
                                <p class="task-topic-decomp-dashboard-kicker">Student Trello Board</p>
                                <h3>Decomposition Task Board</h3>
                            </div>
                            <button type="button" class="detail-action detail-action-secondary" id="task-topic-refresh-decomp-board">Refresh Tasks</button>
                        </div>
                        <p class="task-topic-submission-note">This shows your decomposed work tasks from Trello. Move cards between To Do, Doing, and Done in Trello; DTECH HUB reflects the current board.</p>
                        <p class="task-topic-submission-status" id="task-topic-decomp-board-status" aria-live="polite"></p>
                        <div class="task-topic-decomp-board-columns" id="task-topic-decomp-board-columns">
                            <p class="task-topic-decomp-board-empty">Loading Trello tasks...</p>
                        </div>
                    </section>
                </div>
            ` : ""}

            ${isDecompositionTopic ? "" : `
            <div class="task-topic-submission-actions">
                <button type="submit" class="detail-action">Submit Evidence Link</button>
                <button type="button" class="detail-action detail-action-secondary" id="task-topic-clear-acknowledgement">Clear Submission</button>
            </div>
            `}
            <p class="task-topic-submission-status" id="task-topic-submission-status" aria-live="polite"></p>
        </form>
        ${isDecompositionTopic ? "" : `
        <div class="task-topic-submission-meta">
            <p><strong>Status:</strong> <span id="task-topic-ack-status">${acknowledged ? "Submitted evidence" : "Waiting for submission"}</span></p>
            <p><strong>Submitted At:</strong> <span id="task-topic-last-submitted">${escapeHtml(formatSubmissionTimestamp(acknowledgedAt))}</span></p>
            <p><strong>Evidence Note:</strong> <span id="task-topic-doc-reference">${escapeHtml(currentDocRef || "Not provided")}</span></p>
            ${isDigitalOutcomeTopic
                ? `<p><strong>Description - Google Slides:</strong> <span id="task-topic-google-slides-reference">${currentGoogleSlidesUrl ? `<a href="${escapeHtml(currentGoogleSlidesUrl)}" target="_blank" rel="noreferrer">${escapeHtml(currentGoogleSlidesUrl)}</a>` : "Not linked"}</span></p>`
                : ""
            }
            ${isProjectManagementTopic
                ? `<p><strong>Trello Card:</strong> <span id="task-topic-trello-reference">${currentTrelloCardUrl ? `<a href="${escapeHtml(currentTrelloCardUrl)}" target="_blank" rel="noreferrer">${escapeHtml(currentTrelloCardUrl)}</a>` : "Not linked"}</span></p>`
                : ""
            }
            ${isProjectManagementTopic
                ? `<p><strong>Last Trello Log:</strong> <span id="task-topic-trello-last-log">${escapeHtml(formatSubmissionTimestamp(submission.trelloLastLogAt || ""))}</span></p>`
                : ""
            }
            ${isProjectManagementTopic
                ? `<p><strong>OneDrive Project Folder:</strong> <span id="task-topic-onedrive-reference">${currentOneDriveProjectFolderUrl ? `<a href="${escapeHtml(currentOneDriveProjectFolderUrl)}" target="_blank" rel="noreferrer">${escapeHtml(currentOneDriveProjectFolderUrl)}</a>` : "Not linked"}</span></p>`
                : ""
            }
            ${isMediaAssetWorkflowTopic
                ? `<p><strong>Asset Folder:</strong> <span id="task-topic-media-asset-reference">${currentMediaAssetFolderUrl ? `<a href="${escapeHtml(currentMediaAssetFolderUrl)}" target="_blank" rel="noreferrer">${escapeHtml(currentMediaAssetFolderUrl)}</a>` : "Not linked"}</span></p>`
                : ""
            }
            ${isMediaAssetWorkflowTopic
                ? `<p><strong>Review Link:</strong> <span id="task-topic-media-review-reference">${currentMediaReviewUrl ? `<a href="${escapeHtml(currentMediaReviewUrl)}" target="_blank" rel="noreferrer">${escapeHtml(currentMediaReviewUrl)}</a>` : "Not linked"}</span></p>`
                : ""
            }
            ${isMediaAssetWorkflowTopic
                ? `<p><strong>Last Version Log:</strong> <span id="task-topic-media-last-log">${escapeHtml(formatSubmissionTimestamp(submission.mediaVersionLogAt || ""))}</span></p>`
                : ""
            }
            ${isDecompositionTopic
                ? `<p><strong>Decomposition Plan Steps:</strong> <span id="task-topic-decomp-count">${currentDecompositionSteps.length}</span></p>`
                : ""
            }
            ${isDecompositionTopic
                ? `<p><strong>Last Trello To Do Push:</strong> <span id="task-topic-decomp-last-push">${escapeHtml(formatSubmissionTimestamp(submission.decompositionLastPushAt || ""))}</span></p>`
                : ""
            }
        </div>
        `}
    `;

    const form = panelHost.querySelector("#task-topic-submission-form");
    const clearAckButton = panelHost.querySelector("#task-topic-clear-acknowledgement");
    const docRefInput = panelHost.querySelector("#task-topic-hapara-doc-ref");
    const googleSlidesInput = panelHost.querySelector("#task-topic-google-slides-url");
    const trelloCardInput = panelHost.querySelector("#task-topic-trello-card-url");
    const trelloBoardSelect = panelHost.querySelector("#task-topic-trello-board");
    const trelloListSelect = panelHost.querySelector("#task-topic-trello-list");
    const trelloCreateButton = panelHost.querySelector("#task-topic-create-trello-card");
    const trelloCreateStatusHost = panelHost.querySelector("#task-topic-trello-create-status");
    const trelloLogNoteInput = panelHost.querySelector("#task-topic-trello-log-note");
    const trelloLogButton = panelHost.querySelector("#task-topic-send-trello-log");
    const trelloLogStatusHost = panelHost.querySelector("#task-topic-trello-log-status");
    const oneDriveFolderInput = panelHost.querySelector("#task-topic-onedrive-folder-url");
    const mediaAssetInput = panelHost.querySelector("#task-topic-media-asset-url");
    const mediaReviewInput = panelHost.querySelector("#task-topic-media-review-url");
    const mediaLogNoteInput = panelHost.querySelector("#task-topic-media-log-note");
    const mediaLogButton = panelHost.querySelector("#task-topic-save-media-log");
    const mediaLogStatusHost = panelHost.querySelector("#task-topic-media-log-status");
    const decompStepsInput = panelHost.querySelector("#task-topic-decomp-steps");
    const decompBoardSelect = panelHost.querySelector("#task-topic-decomp-board");
    const decompListSelect = panelHost.querySelector("#task-topic-decomp-list");
    const decompSaveButton = panelHost.querySelector("#task-topic-save-decomp-plan");
    const decompPushButton = panelHost.querySelector("#task-topic-push-decomp-trello");
    const decompStatusHost = panelHost.querySelector("#task-topic-decomp-status");
    const decompBoardRefreshButton = panelHost.querySelector("#task-topic-refresh-decomp-board");
    const decompBoardStatusHost = panelHost.querySelector("#task-topic-decomp-board-status");
    const decompBoardColumnsHost = panelHost.querySelector("#task-topic-decomp-board-columns");
    const decompConnectTrelloButton = panelHost.querySelector("#task-topic-decomp-connect-trello");
    const decompConnectStatusHost = panelHost.querySelector("#task-topic-decomp-connect-status");
    const decompCategoryListHost = panelHost.querySelector("#task-topic-decomp-category-list");
    const decompCategoryTotalHost = panelHost.querySelector("#task-topic-decomp-category-total");
    const decompLastSyncedHost = panelHost.querySelector("#task-topic-decomp-last-synced");
    const decompSavePdfButton = panelHost.querySelector("#task-topic-decomp-save-pdf");
    const decompPdfStatusHost = panelHost.querySelector("#task-topic-decomp-pdf-status");
    const decompTrelloLinkLibrary = panelHost.querySelector("#task-topic-decomp-trello-link-library");
    const decompTrelloLinkLibraryList = panelHost.querySelector("#task-topic-decomp-trello-link-library-list");
    const decompTrelloLinkLibraryCount = panelHost.querySelector("#task-topic-decomp-trello-link-library-count");
    const statusHost = panelHost.querySelector("#task-topic-submission-status");
    const ackStatusHost = panelHost.querySelector("#task-topic-ack-status");
    const lastSubmittedHost = panelHost.querySelector("#task-topic-last-submitted");
    const docRefHost = panelHost.querySelector("#task-topic-doc-reference");
    const googleSlidesRefHost = panelHost.querySelector("#task-topic-google-slides-reference");
    const googleSlidesSyncRefHost = panelHost.querySelector("#task-topic-google-slides-sync-reference");
    const trelloRefHost = panelHost.querySelector("#task-topic-trello-reference");
    const trelloLastLogHost = panelHost.querySelector("#task-topic-trello-last-log");
    const oneDriveRefHost = panelHost.querySelector("#task-topic-onedrive-reference");
    const mediaAssetRefHost = panelHost.querySelector("#task-topic-media-asset-reference");
    const mediaReviewRefHost = panelHost.querySelector("#task-topic-media-review-reference");
    const mediaLastLogHost = panelHost.querySelector("#task-topic-media-last-log");
    const decompCountHost = panelHost.querySelector("#task-topic-decomp-count");
    const decompLastPushHost = panelHost.querySelector("#task-topic-decomp-last-push");
    const updateMeta = (isAcknowledged, timestamp) => {
        if (ackStatusHost) {
            ackStatusHost.textContent = isAcknowledged ? "Submitted evidence" : "Waiting for submission";
        }

        if (lastSubmittedHost) {
            lastSubmittedHost.textContent = formatSubmissionTimestamp(timestamp);
        }

        if (docRefHost) {
            const value = String(docRefInput?.value || "").trim();
            docRefHost.textContent = value || "Not provided";
        }

        if (googleSlidesRefHost) {
            const safeSlidesUrl = toSafeExternalUrl(googleSlidesInput?.value || "");
            if (safeSlidesUrl) {
                googleSlidesRefHost.innerHTML = `<a href="${escapeHtml(safeSlidesUrl)}" target="_blank" rel="noreferrer">${escapeHtml(safeSlidesUrl)}</a>`;
            } else {
                googleSlidesRefHost.textContent = "Not linked";
            }
        }

        if (googleSlidesSyncRefHost) {
            const safeSlidesUrl = toSafeExternalUrl(googleSlidesInput?.value || "");
            if (safeSlidesUrl) {
                syncedGoogleSlidesUrl = safeSlidesUrl;
                writeStoredTaskTopicSlideSyncLink(projectId, email, taskTopicTitle, taskTopicShortName, safeSlidesUrl, {
                    templateId: digitalOutcomeSyncTemplateId,
                    syncSource: "manual-link"
                });
                googleSlidesSyncRefHost.innerHTML = `<a href="${escapeHtml(syncedGoogleSlidesUrl)}" target="_blank" rel="noreferrer">${escapeHtml(syncedGoogleSlidesUrl)}</a>`;
            } else if (syncedGoogleSlidesUrl) {
                googleSlidesSyncRefHost.innerHTML = `<a href="${escapeHtml(syncedGoogleSlidesUrl)}" target="_blank" rel="noreferrer">${escapeHtml(syncedGoogleSlidesUrl)}</a>`;
            } else {
                googleSlidesSyncRefHost.textContent = "No synced slide yet. Open Template Library and click Use Template to link your personal slide copy.";
            }
        }

        if (trelloRefHost) {
            const safeCardUrl = toSafeTrelloCardUrl(trelloCardInput?.value || "");
            if (safeCardUrl) {
                trelloRefHost.innerHTML = `<a href="${escapeHtml(safeCardUrl)}" target="_blank" rel="noreferrer">${escapeHtml(safeCardUrl)}</a>`;
            } else {
                trelloRefHost.textContent = "Not linked";
            }
        }

        if (oneDriveRefHost) {
            const safeOneDriveUrl = toSafeExternalUrl(oneDriveFolderInput?.value || "");
            if (safeOneDriveUrl) {
                oneDriveRefHost.innerHTML = `<a href="${escapeHtml(safeOneDriveUrl)}" target="_blank" rel="noreferrer">${escapeHtml(safeOneDriveUrl)}</a>`;
            } else {
                oneDriveRefHost.textContent = "Not linked";
            }
        }

        if (mediaAssetRefHost) {
            const safeAssetUrl = toSafeExternalUrl(mediaAssetInput?.value || "");
            if (safeAssetUrl) {
                mediaAssetRefHost.innerHTML = `<a href="${escapeHtml(safeAssetUrl)}" target="_blank" rel="noreferrer">${escapeHtml(safeAssetUrl)}</a>`;
            } else {
                mediaAssetRefHost.textContent = "Not linked";
            }
        }

        if (mediaReviewRefHost) {
            const safeReviewUrl = toSafeExternalUrl(mediaReviewInput?.value || "");
            if (safeReviewUrl) {
                mediaReviewRefHost.innerHTML = `<a href="${escapeHtml(safeReviewUrl)}" target="_blank" rel="noreferrer">${escapeHtml(safeReviewUrl)}</a>`;
            } else {
                mediaReviewRefHost.textContent = "Not linked";
            }
        }
    };

    const setStatus = (message, isError = false) => {
        if (!statusHost) {
            return;
        }
        statusHost.textContent = String(message || "");
        statusHost.classList.toggle("is-error", Boolean(isError));
    };

    googleSlidesInput?.addEventListener("input", () => {
        const safeSlidesUrl = toSafeExternalUrl(googleSlidesInput?.value || "");
        if (safeSlidesUrl) {
            syncedGoogleSlidesUrl = safeSlidesUrl;
            writeStoredTaskTopicSlideSyncLink(projectId, email, taskTopicTitle, taskTopicShortName, safeSlidesUrl, {
                templateId: digitalOutcomeSyncTemplateId,
                syncSource: "manual-link"
            });
        }
        updateMeta(acknowledged, acknowledgedAt);
    });

    const setTrelloCreateStatus = (message, isError = false) => {
        if (!trelloCreateStatusHost) return;
        trelloCreateStatusHost.textContent = String(message || "");
        trelloCreateStatusHost.classList.toggle("is-error", Boolean(isError));
    };

    const setTrelloLogStatus = (message, isError = false) => {
        if (!trelloLogStatusHost) return;
        trelloLogStatusHost.textContent = String(message || "");
        trelloLogStatusHost.classList.toggle("is-error", Boolean(isError));
    };

    const setMediaLogStatus = (message, isError = false) => {
        if (!mediaLogStatusHost) return;
        mediaLogStatusHost.textContent = String(message || "");
        mediaLogStatusHost.classList.toggle("is-error", Boolean(isError));
    };

    const setDecompStatus = (message, isError = false) => {
        if (!decompStatusHost) return;
        decompStatusHost.textContent = String(message || "");
        decompStatusHost.classList.toggle("is-error", Boolean(isError));
    };

    const setDecompBoardStatus = (message, isError = false) => {
        if (!decompBoardStatusHost) return;
        decompBoardStatusHost.textContent = String(message || "");
        decompBoardStatusHost.classList.toggle("is-error", Boolean(isError));
    };

    const renderDecompBoardColumn = (title, cards, variant) => {
        const safeCards = Array.isArray(cards) ? cards : [];
        return `
            <section class="task-topic-decomp-board-column task-topic-decomp-board-column-${escapeHtml(variant)}">
                <header>
                    <h4>${escapeHtml(title)}</h4>
                    <span>${safeCards.length}</span>
                </header>
                <div class="task-topic-decomp-card-list">
                    ${safeCards.length
                        ? safeCards.map((card) => {
                            const name = String(card?.name || "Untitled task").trim();
                            const url = toSafeExternalUrl(card?.url || "");
                            const due = String(card?.due || "").trim();
                            const dueLabel = due ? `Due ${escapeHtml(formatSubmissionTimestamp(due))}` : "";
                            return `
                                <article class="task-topic-decomp-trello-card">
                                    ${url
                                        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(name)}</a>`
                                        : `<p>${escapeHtml(name)}</p>`
                                    }
                                    ${dueLabel ? `<span>${dueLabel}</span>` : ""}
                                </article>
                            `;
                        }).join("")
                        : '<p class="task-topic-decomp-board-empty">No tasks in this list.</p>'
                    }
                </div>
            </section>
        `;
    };

    const renderDecompCategoryCoverage = async (cards, persist = false) => {
        if (!decompCategoryListHost) return;
        const safeCards = Array.isArray(cards) ? cards : [];
        const toolsTechniquesKeywords = await fetchToolsTechniquesKeywords();
        const rows = countDecompositionTaskCategories(safeCards, toolsTechniquesKeywords);
        if (persist) {
            writeDecompositionCategoryCoverage(projectId, email, rows);
            void saveDecompositionCategoryCoverage(projectId, rows, safeCards.length);
        }
        if (decompCategoryTotalHost) {
            decompCategoryTotalHost.textContent = `(${safeCards.length} Trello task${safeCards.length === 1 ? "" : "s"})`;
        }
        decompCategoryListHost.innerHTML = rows.map((row) => `
            <li class="task-topic-decomp-category-item${row.count > 0 ? " is-covered" : ""}">
                <span class="task-topic-decomp-category-label">${escapeHtml(row.label)}</span>
                <span class="task-topic-decomp-category-count">${row.count}</span>
            </li>
        `).join("");
    };

    renderDecompCategoryCoverage([]);

    let latestDecompBoardSnapshot = null;

    const renderDecompLastSynced = (isoValue) => {
        if (!decompLastSyncedHost) return;
        const safeIso = String(isoValue || "").trim();
        decompLastSyncedHost.textContent = safeIso
            ? `Last synced: ${formatSubmissionTimestamp(safeIso)}`
            : "Last synced: not yet";
    };

    renderDecompLastSynced(readDecompositionTrelloSyncTime(projectId, email));

    const loadDecompositionTaskBoard = async () => {
        if (!decompBoardColumnsHost) return "";
        if (!currentDecompositionTrelloUrl) {
            decompBoardColumnsHost.innerHTML = '<p class="task-topic-decomp-board-empty">Add your Trello board or card link in Project Management first, then refresh this board.</p>';
            setDecompBoardStatus("Trello board link needed.", true);
            renderDecompCategoryCoverage([]);
            return "";
        }

        if (decompBoardRefreshButton) decompBoardRefreshButton.disabled = true;
        decompBoardColumnsHost.innerHTML = '<p class="task-topic-decomp-board-empty">Loading Trello tasks...</p>';
        setDecompBoardStatus("Loading your current Trello tasks...");

        try {
            const response = await fetch(
                `/api/integrations/trello/list-progress?student_email=${encodeURIComponent(email)}&board_url=${encodeURIComponent(currentDecompositionTrelloUrl)}`,
                { headers: buildWriteHeaders() }
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const notConnectedError = new Error(payload?.error || "Could not load Trello tasks.");
                notConnectedError.status = response.status;
                throw notConnectedError;
            }

            decompBoardColumnsHost.innerHTML = [
                renderDecompBoardColumn("To Do", payload?.todo_cards, "todo"),
                renderDecompBoardColumn("Doing", payload?.doing_cards, "doing"),
                renderDecompBoardColumn("Done", payload?.done_cards, "done")
            ].join("");
            renderDecompCategoryCoverage([
                ...(Array.isArray(payload?.todo_cards) ? payload.todo_cards : []),
                ...(Array.isArray(payload?.doing_cards) ? payload.doing_cards : []),
                ...(Array.isArray(payload?.done_cards) ? payload.done_cards : [])
            ], true);
            latestDecompBoardSnapshot = payload || null;
            const syncedAtIso = new Date().toISOString();
            writeDecompositionTrelloSyncTime(projectId, email, syncedAtIso);
            renderDecompLastSynced(syncedAtIso);
            setDecompBoardStatus(`Trello board updated: ${Number(payload?.todo_count || 0)} to do, ${Number(payload?.doing_count || 0)} doing, ${Number(payload?.done_count || 0)} done.`);
            return String(payload?.board_id || "").trim();
        } catch (error) {
            renderDecompCategoryCoverage([]);
            // Saving a Trello link and connecting the Trello account (API token) are separate steps; this board needs the account connection.
            if (Number(error?.status) === 404 && /has not connected trello/i.test(String(error?.message || ""))) {
                decompBoardColumnsHost.innerHTML = '<p class="task-topic-decomp-board-empty">Your Trello link is saved, but DTECH HUB also needs your Trello account connected to read your cards. Click Connect Trello Account above, then refresh this board.</p>';
                setDecompBoardStatus("Trello account not connected yet.", true);
                if (decompConnectTrelloButton) decompConnectTrelloButton.hidden = false;
                return "";
            }
            decompBoardColumnsHost.innerHTML = '<p class="task-topic-decomp-board-empty">Could not load Trello tasks right now.</p>';
            setDecompBoardStatus(error?.message || "Could not load Trello tasks.", true);
            return "";
        } finally {
            if (decompBoardRefreshButton?.isConnected) decompBoardRefreshButton.disabled = false;
        }
    };

    if (isProjectManagementTopic && trelloBoardSelect && trelloListSelect) {
        const projectManagementBoardUrlById = new Map();
        let projectManagementLinkedBoardId = "";

        try {
            const boardsResponse = await fetch("/api/integrations/trello/boards", { headers: buildWriteHeaders() });
            if (boardsResponse.ok) {
                const boards = await boardsResponse.json().catch(() => []);
                (Array.isArray(boards) ? boards : []).forEach((board) => {
                    const boardId = String(board?.id || "").trim();
                    const boardUrl = toSafeTrelloCardUrl(board?.url || "");
                    if (boardId && boardUrl) {
                        projectManagementBoardUrlById.set(boardId, boardUrl);
                    }
                });
                const boardOptions = (Array.isArray(boards) ? boards : [])
                    .map((board) => `<option value="${escapeHtml(board.id)}">${escapeHtml(board.name || board.id)}</option>`)
                    .join("");
                trelloBoardSelect.innerHTML = `<option value="">Select board</option>${boardOptions}`;
                const currentBoardId = extractTrelloBoardIdFromUrl(currentDecompositionTrelloUrl);
                projectManagementLinkedBoardId = Array.from(projectManagementBoardUrlById.entries()).find(([boardId, boardUrl]) =>
                    boardUrl === currentDecompositionTrelloUrl || (currentBoardId && boardId === currentBoardId)
                )?.[0] || "";
            } else {
                setTrelloCreateStatus("Connect Trello first (Student Work page), then reload.", true);
            }
        } catch (_error) {
            setTrelloCreateStatus("Could not load Trello boards right now.", true);
        }

        trelloBoardSelect.addEventListener("change", async () => {
            const boardId = String(trelloBoardSelect.value || "").trim();
            trelloListSelect.innerHTML = `<option value="">Loading lists...</option>`;
            if (!boardId) {
                trelloListSelect.innerHTML = `<option value="">Select list</option>`;
                return;
            }

            // Syncing the board here also becomes the shared Favourite so the Decomposition board shows the same tasks.
            const selectedBoardUrl = projectManagementBoardUrlById.get(boardId) || "";
            if (selectedBoardUrl) {
                try {
                    await persistStudentTrelloLinkDirectlyToEvidence(projectId, email, detailData, taskTopicTitle, selectedBoardUrl);
                    addStoredTrelloCardLibraryLink(projectId, email, selectedBoardUrl);
                    writeStoredTrelloCardLink(projectId, email, selectedBoardUrl);
                    setFavouriteTrelloCardLibraryLink(projectId, email, selectedBoardUrl);
                    currentDecompositionTrelloUrl = selectedBoardUrl;
                    submission.trelloCardUrl = selectedBoardUrl;
                    if (trelloCardInput) {
                        trelloCardInput.value = selectedBoardUrl;
                    }
                    setTrelloStatus("Trello board linked with Decomposition.", false, true);
                } catch (error) {
                    setTrelloStatus(error?.message || "Could not link this Trello board with Decomposition.", true);
                }
            }

            try {
                const listsResponse = await fetch(`/api/integrations/trello/boards/${encodeURIComponent(boardId)}/lists`, { headers: buildWriteHeaders() });
                if (!listsResponse.ok) {
                    throw new Error("Could not load lists.");
                }

                const lists = await listsResponse.json().catch(() => []);
                const listOptions = (Array.isArray(lists) ? lists : [])
                    .map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name || list.id)}</option>`)
                    .join("");
                trelloListSelect.innerHTML = `<option value="">Select list</option>${listOptions}`;
            } catch (_error) {
                trelloListSelect.innerHTML = `<option value="">Select list</option>`;
                setTrelloCreateStatus("Could not load Trello lists.", true);
            }
        });

        if (projectManagementLinkedBoardId) {
            trelloBoardSelect.value = projectManagementLinkedBoardId;
            trelloBoardSelect.dispatchEvent(new Event("change"));
        }

        trelloCreateButton?.addEventListener("click", async () => {
            const listId = String(trelloListSelect.value || "").trim();
            if (!listId) {
                setTrelloCreateStatus("Select a Trello list first.", true);
                return;
            }

            const cardName = `${detailData?.title || "Project"} - ${taskTopicShortName || deriveTaskShortName(taskTopicTitle) || "Project Management"}`;
            const cardDesc = [
                `Student: ${email}`,
                `Task Topic: ${taskTopicTitle}`,
                "",
                "Daily log prompts:",
                "1) What did I complete today?",
                "2) What blocker did I hit?",
                "3) What is my next step before next lesson?"
            ].join("\n");

            trelloCreateButton.disabled = true;
            setTrelloCreateStatus("Creating Trello card...");
            try {
                const createResponse = await fetch("/api/integrations/trello/cards", {
                    method: "POST",
                    headers: buildWriteHeaders(),
                    body: JSON.stringify({
                        list_id: listId,
                        name: cardName,
                        desc: cardDesc,
                        pos: "top"
                    })
                });

                if (!createResponse.ok) {
                    const createError = await createResponse.json().catch(() => ({}));
                    throw new Error(createError.error || "Could not create Trello card.");
                }

                const created = await createResponse.json().catch(() => ({}));
                const safeUrl = toSafeTrelloCardUrl(created.url || "");
                if (safeUrl && trelloCardInput) {
                    trelloCardInput.value = safeUrl;
                }
                setTrelloCreateStatus("Trello card created and linked.");
                updateMeta(acknowledged, acknowledgedAt);
            } catch (error) {
                setTrelloCreateStatus(error.message || "Could not create Trello card.", true);
            } finally {
                if (trelloCreateButton && trelloCreateButton.isConnected) trelloCreateButton.disabled = false;
            }
        });

        trelloLogButton?.addEventListener("click", async () => {
            const safeCardUrl = toSafeTrelloCardUrl(trelloCardInput?.value || "");
            const note = String(trelloLogNoteInput?.value || "").trim();
            if (!safeCardUrl) {
                setTrelloLogStatus("Add a valid Trello card or board link first.", true);
                return;
            }
            if (!note) {
                setTrelloLogStatus("Add your daily log note before sending.", true);
                return;
            }

            if (trelloLogButton) trelloLogButton.disabled = true;
            setTrelloLogStatus("Sending log to Trello...");

            try {
                const sendResponse = await fetch("/api/integrations/trello/work-log", {
                    method: "POST",
                    headers: buildWriteHeaders(),
                    body: JSON.stringify({
                        card_url: safeCardUrl,
                        note,
                        activity_title: `${detailData?.title || "Project"} - ${taskTopicTitle}`
                    })
                });

                if (!sendResponse.ok) {
                    const sendError = await sendResponse.json().catch(() => ({}));
                    throw new Error(sendError.error || "Could not send Trello log.");
                }

                const nowIso = new Date().toISOString();
                const logDate = getNzDateKey(new Date());
                const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
                    writtenEvidence: submission.writtenEvidence,
                    evidenceLink: submission.evidenceLink,
                    fileName: submission.fileName,
                    fileUrl: submission.fileUrl,
                    submittedAt: submission.submittedAt,
                    haparaAcknowledged: submission.haparaAcknowledged,
                    haparaSubmittedAt: submission.haparaSubmittedAt,
                    haparaLocation: submission.haparaLocation,
                    haparaDriveClassUrl: submission.haparaDriveClassUrl,
                    haparaDocumentRef: submission.haparaDocumentRef,
                    trelloCardUrl: safeCardUrl,
                    trelloLastLogDate: logDate,
                    trelloLastLogAt: nowIso,
                    trelloLastLogNote: note,
                    reviewStatus: submission.reviewStatus
                });

                await saveEvidenceRows(projectId, email, nextRows);
                evidenceRows = nextRows;
                submission.trelloCardUrl = safeCardUrl;
                submission.trelloLastLogDate = logDate;
                submission.trelloLastLogAt = nowIso;
                submission.trelloLastLogNote = note;

                if (trelloLastLogHost) {
                    trelloLastLogHost.textContent = formatSubmissionTimestamp(nowIso);
                }
                if (trelloLogNoteInput) {
                    trelloLogNoteInput.value = "";
                }
                setTrelloLogStatus("Trello log sent. Daily prompt complete for today.");
            } catch (error) {
                setTrelloLogStatus(error.message || "Could not send Trello log.", true);
            } finally {
                if (trelloLogButton && trelloLogButton.isConnected) trelloLogButton.disabled = false;
            }
        });
    }

    if (isMediaAssetWorkflowTopic) {
        mediaLogButton?.addEventListener("click", async () => {
            const safeAssetUrl = toSafeExternalUrl(mediaAssetInput?.value || "");
            const safeReviewUrl = toSafeExternalUrl(mediaReviewInput?.value || "");
            const note = String(mediaLogNoteInput?.value || "").trim();

            if (!safeAssetUrl) {
                setMediaLogStatus("Add a valid master asset folder link first.", true);
                return;
            }
            if (!note) {
                setMediaLogStatus("Add your version log note before saving.", true);
                return;
            }

            if (mediaLogButton) mediaLogButton.disabled = true;
            setMediaLogStatus("Saving version log...");

            try {
                const nowIso = new Date().toISOString();
                const logDate = getNzDateKey(new Date());
                const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
                    writtenEvidence: submission.writtenEvidence,
                    evidenceLink: submission.evidenceLink,
                    fileName: submission.fileName,
                    fileUrl: submission.fileUrl,
                    submittedAt: submission.submittedAt,
                    haparaAcknowledged: submission.haparaAcknowledged,
                    haparaSubmittedAt: submission.haparaSubmittedAt,
                    haparaLocation: submission.haparaLocation,
                    haparaDriveClassUrl: submission.haparaDriveClassUrl,
                    haparaDocumentRef: submission.haparaDocumentRef,
                    trelloCardUrl: submission.trelloCardUrl,
                    trelloLastLogDate: submission.trelloLastLogDate,
                    trelloLastLogAt: submission.trelloLastLogAt,
                    trelloLastLogNote: submission.trelloLastLogNote,
                    mediaAssetFolderUrl: safeAssetUrl,
                    mediaReviewUrl: safeReviewUrl,
                    mediaVersionLogDate: logDate,
                    mediaVersionLogAt: nowIso,
                    mediaVersionLogNote: note,
                    reviewStatus: submission.reviewStatus
                });

                await saveEvidenceRows(projectId, email, nextRows);
                evidenceRows = nextRows;
                submission.mediaAssetFolderUrl = safeAssetUrl;
                submission.mediaReviewUrl = safeReviewUrl;
                submission.mediaVersionLogDate = logDate;
                submission.mediaVersionLogAt = nowIso;
                submission.mediaVersionLogNote = note;

                if (mediaLastLogHost) {
                    mediaLastLogHost.textContent = formatSubmissionTimestamp(nowIso);
                }
                if (mediaLogNoteInput) {
                    mediaLogNoteInput.value = "";
                }
                updateMeta(acknowledged, acknowledgedAt);
                setMediaLogStatus("Version log saved. Daily prompt complete for today.");
            } catch (_error) {
                setMediaLogStatus("Could not save version log right now.", true);
            } finally {
                if (mediaLogButton && mediaLogButton.isConnected) mediaLogButton.disabled = false;
            }
        });
    }

    if (isDecompositionTopic && decompBoardSelect && decompListSelect) {
        const boardUrlById = new Map();
        let linkedBoardId = "";

        const setDecompConnectStatus = (message, isError = false) => {
            if (!decompConnectStatusHost) return;
            decompConnectStatusHost.textContent = String(message || "");
            decompConnectStatusHost.classList.toggle("is-error", Boolean(isError));
        };

        const renderDecompTrelloLinkLibrary = () => {
            if (!decompTrelloLinkLibrary || !decompTrelloLinkLibraryList) return;
            const items = readStoredTrelloCardLibrary(projectId, email);
            if (!items.length) {
                decompTrelloLinkLibrary.hidden = true;
                if (decompTrelloLinkLibraryCount) decompTrelloLinkLibraryCount.textContent = "(0)";
                decompTrelloLinkLibraryList.innerHTML = "";
                return;
            }

            decompTrelloLinkLibrary.hidden = false;
            if (decompTrelloLinkLibraryCount) decompTrelloLinkLibraryCount.textContent = `(${items.length})`;
            decompTrelloLinkLibraryList.innerHTML = items
                .map((item) => {
                    const url = toSafeTrelloCardUrl(item?.url || "");
                    if (!url) return "";
                    const isFavourite = Boolean(item?.favourite);
                    return `
                        <li class="trello-link-library-item${isFavourite ? " is-favourite" : ""}" data-trello-link-item="${escapeHtml(url)}">
                            <div class="trello-link-library-link-wrap">
                                <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
                                <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item?.savedAt))}</span>
                                ${isFavourite ? `<span class="trello-link-library-favourite-badge">&#9733; Favourite</span>` : ""}
                            </div>
                            <div class="trello-link-library-actions">
                                <button type="button" class="trello-link-library-favourite-btn${isFavourite ? " is-favourite" : ""}" data-decomp-trello-favourite="${escapeHtml(url)}" aria-pressed="${isFavourite ? "true" : "false"}" title="${isFavourite ? "Favourite link used by Decomposition" : "Mark as Favourite"}">${isFavourite ? "&#9733;" : "&#9734;"}</button>
                                <button type="button" class="detail-action detail-action-secondary" data-decomp-trello-use="${escapeHtml(url)}">Use</button>
                                <button type="button" class="detail-action detail-action-secondary" data-decomp-trello-open="${escapeHtml(url)}">Open</button>
                                <button type="button" class="detail-action detail-action-danger" data-decomp-trello-delete="${escapeHtml(url)}">Delete</button>
                            </div>
                        </li>
                    `;
                })
                .join("");
        };

        decompTrelloLinkLibraryList?.addEventListener("click", async (event) => {
            const favouriteBtn = event.target.closest("[data-decomp-trello-favourite]");
            if (favouriteBtn) {
                const url = toSafeTrelloCardUrl(favouriteBtn.getAttribute("data-decomp-trello-favourite") || "");
                if (!url) return;
                setFavouriteTrelloCardLibraryLink(projectId, email, url);
                currentDecompositionTrelloUrl = url;
                renderDecompTrelloLinkLibrary();
                void loadDecompositionTaskBoard();
                return;
            }

            const useBtn = event.target.closest("[data-decomp-trello-use]");
            if (useBtn) {
                const url = toSafeTrelloCardUrl(useBtn.getAttribute("data-decomp-trello-use") || "");
                if (!url) return;
                currentDecompositionTrelloUrl = url;
                void loadDecompositionTaskBoard();
                return;
            }

            const openBtn = event.target.closest("[data-decomp-trello-open]");
            if (openBtn) {
                const url = toSafeTrelloCardUrl(openBtn.getAttribute("data-decomp-trello-open") || "");
                if (url) window.open(url, "_blank", "noopener,noreferrer");
                return;
            }

            const deleteBtn = event.target.closest("[data-decomp-trello-delete]");
            if (deleteBtn) {
                const url = toSafeTrelloCardUrl(deleteBtn.getAttribute("data-decomp-trello-delete") || "");
                if (!url || !window.confirm("Delete this saved Trello link?")) return;
                deleteBtn.disabled = true;
                try {
                    await removeUrlFromEvidenceSteps(projectId, email, url, ["TRELLO_CARD_URL|"]);
                    removeStoredTrelloCardLibraryLink(projectId, email, url);
                    setDecompStatus("Removed saved Trello link.");
                } catch (_error) {
                    setDecompStatus("Could not remove that Trello link.", true);
                } finally {
                    renderDecompTrelloLinkLibrary();
                }
            }
        });

        renderDecompTrelloLinkLibrary();

        decompConnectTrelloButton?.addEventListener("click", async () => {
            decompConnectTrelloButton.disabled = true;
            setDecompConnectStatus("Connecting Trello... Authorize DTECH-HUB in the popup window.");
            try {
                const token = await openInlineTrelloConnectPopup();
                const connectResponse = await fetch("/api/integrations/trello/connect", {
                    method: "POST",
                    headers: buildWriteHeaders(),
                    body: JSON.stringify({ token })
                });
                const connectPayload = await connectResponse.json().catch(() => ({}));
                if (!connectResponse.ok) {
                    throw new Error(connectPayload?.error || "Could not connect Trello.");
                }
                setDecompConnectStatus("Trello connected! Loading your board...");
                decompConnectTrelloButton.hidden = true;
                void loadDecompositionTaskBoard();
            } catch (error) {
                setDecompConnectStatus(error?.message || "Could not connect Trello.", true);
            } finally {
                if (decompConnectTrelloButton?.isConnected) decompConnectTrelloButton.disabled = false;
            }
        });

        const setDecompPdfStatus = (message, isError = false) => {
            if (!decompPdfStatusHost) return;
            decompPdfStatusHost.textContent = String(message || "");
            decompPdfStatusHost.classList.toggle("is-error", Boolean(isError));
        };

        decompSavePdfButton?.addEventListener("click", async () => {
            if (!latestDecompBoardSnapshot) {
                setDecompPdfStatus("Load your Trello board first, then save the PDF.", true);
                return;
            }

            if (typeof requestHubDriveAccessToken !== "function") {
                setDecompPdfStatus("Google Drive sign-in is not ready on this page yet.", true);
                return;
            }

            decompSavePdfButton.disabled = true;
            setDecompPdfStatus("Building your Trello PDF...");

            try {
                const toCardNames = (cards) => (Array.isArray(cards) ? cards : []).map((card) => String(card?.name || "Untitled task").trim());
                const allCards = [
                    ...(Array.isArray(latestDecompBoardSnapshot?.todo_cards) ? latestDecompBoardSnapshot.todo_cards : []),
                    ...(Array.isArray(latestDecompBoardSnapshot?.doing_cards) ? latestDecompBoardSnapshot.doing_cards : []),
                    ...(Array.isArray(latestDecompBoardSnapshot?.done_cards) ? latestDecompBoardSnapshot.done_cards : [])
                ];
                const lastSyncedIso = readDecompositionTrelloSyncTime(projectId, email);
                const pdfToolsTechniquesKeywords = await fetchToolsTechniquesKeywords();

                const fileBase64 = await buildDecompositionTrelloPdfBase64({
                    projectTitle: taskTopicTitle || "Decomposition Tasks",
                    email,
                    generatedLabel: formatSubmissionTimestamp(new Date().toISOString()),
                    lastSyncedLabel: lastSyncedIso ? formatSubmissionTimestamp(lastSyncedIso) : "not yet",
                    categories: countDecompositionTaskCategories(allCards, pdfToolsTechniquesKeywords),
                    links: readStoredTrelloCardLibrary(projectId, email),
                    columns: [
                        { title: "To Do", cards: toCardNames(latestDecompBoardSnapshot?.todo_cards) },
                        { title: "Doing", cards: toCardNames(latestDecompBoardSnapshot?.doing_cards) },
                        { title: "Done", cards: toCardNames(latestDecompBoardSnapshot?.done_cards) }
                    ]
                });

                setDecompPdfStatus("Saving to Google Drive...");
                const tokenResponse = await requestHubDriveAccessToken({ forceConsent: false });
                const driveAccessToken = String(tokenResponse?.access_token || "").trim();
                if (!driveAccessToken) {
                    throw new Error(tokenResponse?.error || "Google Drive access was not granted.");
                }

                const uploadResponse = await fetch("/api/student/drive-setup/upload-decomposition-pdf", {
                    method: "POST",
                    headers: buildWriteHeaders(),
                    body: JSON.stringify({
                        driveAccessToken,
                        fileName: buildTrelloPdfFileName(),
                        fileBase64
                    })
                });
                const uploadPayload = await uploadResponse.json().catch(() => ({}));
                if (!uploadResponse.ok) {
                    throw new Error(uploadPayload?.error || "Could not save the PDF to Google Drive.");
                }

                const savedName = String(uploadPayload?.fileName || buildTrelloPdfFileName());
                setDecompPdfStatus(`${uploadPayload?.replaced ? "Updated" : "Saved"} ${savedName} in SeniorDTECH / Process Assessment / Decomposition.`);
                if (uploadPayload?.fileUrl) {
                    window.open(uploadPayload.fileUrl, "_blank", "noopener");
                }
            } catch (error) {
                setDecompPdfStatus(error?.message || "Could not save the Trello PDF.", true);
            } finally {
                if (decompSavePdfButton?.isConnected) decompSavePdfButton.disabled = false;
            }
        });

        try {
            const statusResponse = await fetch("/api/integrations/trello/status", { headers: buildWriteHeaders() });
            const statusPayload = await statusResponse.json().catch(() => ({}));
            if (decompConnectTrelloButton) {
                decompConnectTrelloButton.hidden = Boolean(statusPayload?.connected);
            }
        } catch (_error) {
            if (decompConnectTrelloButton) decompConnectTrelloButton.hidden = false;
        }

        decompBoardRefreshButton?.addEventListener("click", () => {
            void loadDecompositionTaskBoard();
        });

        try {
            const boardsResponse = await fetch("/api/integrations/trello/boards", { headers: buildWriteHeaders() });
            if (boardsResponse.ok) {
                const boards = await boardsResponse.json().catch(() => []);
                (Array.isArray(boards) ? boards : []).forEach((board) => {
                    const boardId = String(board?.id || "").trim();
                    const boardUrl = toSafeTrelloCardUrl(board?.url || "");
                    if (boardId && boardUrl) {
                        boardUrlById.set(boardId, boardUrl);
                    }
                });
                const boardOptions = (Array.isArray(boards) ? boards : [])
                    .map((board) => `<option value="${escapeHtml(board.id)}">${escapeHtml(board.name || board.id)}</option>`)
                    .join("");
                decompBoardSelect.innerHTML = `<option value="">Select board</option>${boardOptions}`;

                // A saved card link or a renamed board slug can differ in exact text, so match by Trello board ID as well.
                const currentBoardId = extractTrelloBoardIdFromUrl(currentDecompositionTrelloUrl);
                linkedBoardId = Array.from(boardUrlById.entries()).find(([boardId, boardUrl]) =>
                    boardUrl === currentDecompositionTrelloUrl || (currentBoardId && boardId === currentBoardId)
                )?.[0] || "";
            } else {
                setDecompStatus("Connect Trello first (Student Work page), then reload.", true);
            }
        } catch (_error) {
            setDecompStatus("Could not load Trello boards right now.", true);
        }

        const resolvedBoardId = await loadDecompositionTaskBoard();
        if (!linkedBoardId && resolvedBoardId && boardUrlById.has(resolvedBoardId)) {
            linkedBoardId = resolvedBoardId;
        }

        decompBoardSelect.addEventListener("change", async () => {
            const boardId = String(decompBoardSelect.value || "").trim();
            decompListSelect.innerHTML = `<option value="">Loading lists...</option>`;
            if (!boardId) {
                decompListSelect.innerHTML = `<option value="">Select list</option>`;
                return;
            }

            const selectedBoardUrl = boardUrlById.get(boardId) || "";
            if (selectedBoardUrl) {
                try {
                    await persistStudentTrelloLinkDirectlyToEvidence(
                        projectId,
                        email,
                        detailData,
                        taskTopicTitle,
                        selectedBoardUrl
                    );
                    addStoredTrelloCardLibraryLink(projectId, email, selectedBoardUrl);
                    writeStoredTrelloCardLink(projectId, email, selectedBoardUrl);
                    setFavouriteTrelloCardLibraryLink(projectId, email, selectedBoardUrl);
                    currentDecompositionTrelloUrl = selectedBoardUrl;
                    submission.trelloCardUrl = selectedBoardUrl;
                    void loadDecompositionTaskBoard();
                    renderDecompTrelloLinkLibrary();
                    setDecompStatus("Trello board linked with Project Management.");
                } catch (error) {
                    setDecompStatus(error?.message || "Could not link this Trello board with Project Management.", true);
                }
            }

            try {
                const listsResponse = await fetch(`/api/integrations/trello/boards/${encodeURIComponent(boardId)}/lists`, { headers: buildWriteHeaders() });
                if (!listsResponse.ok) {
                    throw new Error("Could not load lists.");
                }

                const lists = await listsResponse.json().catch(() => []);
                const listOptions = (Array.isArray(lists) ? lists : [])
                    .map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name || list.id)}</option>`)
                    .join("");
                decompListSelect.innerHTML = `<option value="">Select list</option>${listOptions}`;
            } catch (_error) {
                decompListSelect.innerHTML = `<option value="">Select list</option>`;
                setDecompStatus("Could not load Trello lists.", true);
            }
        });

        if (linkedBoardId) {
            decompBoardSelect.value = linkedBoardId;
            decompBoardSelect.dispatchEvent(new Event("change"));
        }

        decompSaveButton?.addEventListener("click", async () => {
            const decompositionSteps = parseDecompositionStepsText(decompStepsInput?.value || "");
            if (!decompositionSteps.length) {
                setDecompStatus("Add at least one decomposition step before saving.", true);
                return;
            }

            if (decompSaveButton) decompSaveButton.disabled = true;
            setDecompStatus("Saving decomposition plan...");
            try {
                const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
                    writtenEvidence: submission.writtenEvidence,
                    evidenceLink: submission.evidenceLink,
                    fileName: submission.fileName,
                    fileUrl: submission.fileUrl,
                    submittedAt: submission.submittedAt,
                    haparaAcknowledged: submission.haparaAcknowledged,
                    haparaSubmittedAt: submission.haparaSubmittedAt,
                    haparaLocation: submission.haparaLocation,
                    haparaDriveClassUrl: submission.haparaDriveClassUrl,
                    haparaDocumentRef: submission.haparaDocumentRef,
                    trelloCardUrl: submission.trelloCardUrl,
                    trelloLastLogDate: submission.trelloLastLogDate,
                    trelloLastLogAt: submission.trelloLastLogAt,
                    trelloLastLogNote: submission.trelloLastLogNote,
                    mediaAssetFolderUrl: submission.mediaAssetFolderUrl,
                    mediaReviewUrl: submission.mediaReviewUrl,
                    mediaVersionLogDate: submission.mediaVersionLogDate,
                    mediaVersionLogAt: submission.mediaVersionLogAt,
                    mediaVersionLogNote: submission.mediaVersionLogNote,
                    decompositionSteps,
                    decompositionLastPushAt: submission.decompositionLastPushAt,
                    decompositionLastPushCount: submission.decompositionLastPushCount,
                    reviewStatus: submission.reviewStatus
                });

                await saveEvidenceRows(projectId, email, nextRows);
                evidenceRows = nextRows;
                submission.decompositionSteps = decompositionSteps;
                if (decompCountHost) {
                    decompCountHost.textContent = String(decompositionSteps.length);
                }
                setDecompStatus(`Saved ${decompositionSteps.length} decomposition step${decompositionSteps.length === 1 ? "" : "s"}.`);
            } catch (_error) {
                setDecompStatus("Could not save decomposition plan right now.", true);
            } finally {
                if (decompSaveButton && decompSaveButton.isConnected) decompSaveButton.disabled = false;
            }
        });

        decompPushButton?.addEventListener("click", async () => {
            const listId = String(decompListSelect.value || "").trim();
            const decompositionSteps = parseDecompositionStepsText(decompStepsInput?.value || "");

            if (!listId) {
                setDecompStatus("Select a Trello To Do list first.", true);
                return;
            }
            if (!decompositionSteps.length) {
                setDecompStatus("Add at least one decomposition step before pushing.", true);
                return;
            }

            if (decompPushButton) decompPushButton.disabled = true;
            setDecompStatus("Pushing decomposition steps to Trello To Do...");

            let createdCount = 0;
            const failedSteps = [];
            try {
                for (const step of decompositionSteps) {
                    const cardName = `${detailData?.title || "Assessment Task"}: ${step}`;
                    const cardDesc = [
                        `Student: ${email}`,
                        `Task Topic: ${taskTopicTitle}`,
                        "",
                        "Created from DTECH Decomposition Planner"
                    ].join("\n");

                    const createResponse = await fetch("/api/integrations/trello/cards", {
                        method: "POST",
                        headers: buildWriteHeaders(),
                        body: JSON.stringify({
                            list_id: listId,
                            name: cardName,
                            desc: cardDesc,
                            pos: "top"
                        })
                    });

                    if (!createResponse.ok) {
                        failedSteps.push(step);
                        continue;
                    }
                    createdCount += 1;
                }

                const nowIso = new Date().toISOString();
                const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
                    writtenEvidence: submission.writtenEvidence,
                    evidenceLink: submission.evidenceLink,
                    fileName: submission.fileName,
                    fileUrl: submission.fileUrl,
                    submittedAt: submission.submittedAt,
                    haparaAcknowledged: submission.haparaAcknowledged,
                    haparaSubmittedAt: submission.haparaSubmittedAt,
                    haparaLocation: submission.haparaLocation,
                    haparaDriveClassUrl: submission.haparaDriveClassUrl,
                    haparaDocumentRef: submission.haparaDocumentRef,
                    trelloCardUrl: submission.trelloCardUrl,
                    trelloLastLogDate: submission.trelloLastLogDate,
                    trelloLastLogAt: submission.trelloLastLogAt,
                    trelloLastLogNote: submission.trelloLastLogNote,
                    mediaAssetFolderUrl: submission.mediaAssetFolderUrl,
                    mediaReviewUrl: submission.mediaReviewUrl,
                    mediaVersionLogDate: submission.mediaVersionLogDate,
                    mediaVersionLogAt: submission.mediaVersionLogAt,
                    mediaVersionLogNote: submission.mediaVersionLogNote,
                    decompositionSteps,
                    decompositionLastPushAt: createdCount > 0 ? nowIso : submission.decompositionLastPushAt,
                    decompositionLastPushCount: createdCount,
                    reviewStatus: submission.reviewStatus
                });

                await saveEvidenceRows(projectId, email, nextRows);
                evidenceRows = nextRows;
                submission.decompositionSteps = decompositionSteps;
                if (createdCount > 0) {
                    submission.decompositionLastPushAt = nowIso;
                    submission.decompositionLastPushCount = createdCount;
                }

                if (decompCountHost) {
                    decompCountHost.textContent = String(decompositionSteps.length);
                }
                if (decompLastPushHost && createdCount > 0) {
                    decompLastPushHost.textContent = formatSubmissionTimestamp(nowIso);
                }

                if (failedSteps.length) {
                    setDecompStatus(`Created ${createdCount} card(s). ${failedSteps.length} step(s) could not be created.`, true);
                } else {
                    setDecompStatus(`Created ${createdCount} Trello To Do card${createdCount === 1 ? "" : "s"}.`);
                }
                if (createdCount > 0) {
                    void loadDecompositionTaskBoard();
                }
            } catch (_error) {
                setDecompStatus("Could not push decomposition steps to Trello right now.", true);
            } finally {
                if (decompPushButton && decompPushButton.isConnected) decompPushButton.disabled = false;
            }
        });
    }

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const docReference = String(docRefInput?.value || "").trim();

        const trelloCardUrl = toSafeTrelloCardUrl(trelloCardInput?.value || "");
        if (isProjectManagementTopic && !trelloCardUrl) {
            setStatus("Project Management requires a valid Trello card link before acknowledging.", true);
            return;
        }

        const googleSlidesUrl = toSafeExternalUrl(googleSlidesInput?.value || "");
        if (isDigitalOutcomeTopic && !googleSlidesUrl) {
            setStatus("Digital Outcome Description requires a valid Google Slides link before acknowledging.", true);
            return;
        }

        const oneDriveProjectFolderUrl = toSafeExternalUrl(oneDriveFolderInput?.value || "");
        if (isProjectManagementTopic && !oneDriveProjectFolderUrl) {
            setStatus("Project Management requires a valid OneDrive project folder link before acknowledging.", true);
            return;
        }

        const mediaAssetFolderUrl = oneDriveProjectFolderUrl || toSafeExternalUrl(mediaAssetInput?.value || "");
        const mediaReviewUrl = toSafeExternalUrl(mediaReviewInput?.value || "");
        if (isMediaAssetWorkflowTopic && !mediaAssetFolderUrl) {
            setStatus("Asset Management requires a valid master asset folder link before acknowledging.", true);
            return;
        }

        const submitButton = form.querySelector("button[type='submit']");
        if (submitButton) {
            submitButton.disabled = true;
        }
        setStatus("Saving evidence submission...");

        const submittedAt = new Date().toISOString();
        const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
            writtenEvidence: submission.writtenEvidence,
            evidenceLink: submission.evidenceLink,
            fileName: submission.fileName,
            fileUrl: submission.fileUrl,
            submittedAt,
            haparaAcknowledged: true,
            haparaSubmittedAt: submittedAt,
            haparaLocation: haparaSpaceName,
            haparaDriveClassUrl: haparaClassDriveUrl,
            haparaDocumentRef: docReference,
            googleSlidesUrl,
            trelloCardUrl,
            trelloLastLogDate: submission.trelloLastLogDate,
            trelloLastLogAt: submission.trelloLastLogAt,
            trelloLastLogNote: submission.trelloLastLogNote,
            mediaAssetFolderUrl,
            mediaReviewUrl,
            mediaVersionLogDate: submission.mediaVersionLogDate,
            mediaVersionLogAt: submission.mediaVersionLogAt,
            mediaVersionLogNote: submission.mediaVersionLogNote,
            reviewStatus: "pending"
        });

        try {
            await saveEvidenceRows(projectId, email, nextRows);
            evidenceRows = nextRows;
            submission.haparaAcknowledged = true;
            submission.haparaSubmittedAt = submittedAt;
            submission.haparaLocation = haparaSpaceName;
            submission.haparaDriveClassUrl = haparaClassDriveUrl;
            submission.haparaDocumentRef = docReference;
            submission.googleSlidesUrl = googleSlidesUrl;
            submission.trelloCardUrl = trelloCardUrl;
            submission.mediaAssetFolderUrl = mediaAssetFolderUrl;
            submission.mediaReviewUrl = mediaReviewUrl;
            submission.submittedAt = submittedAt;
            submission.reviewStatus = "pending";

            updateMeta(true, submittedAt);
            setStatus("Saved. Your evidence submission has been recorded.");
        } catch (error) {
            setStatus(error?.message || "Could not save your evidence submission right now.", true);
        } finally {
            if (submitButton && submitButton.isConnected) {
                submitButton.disabled = false;
            }
        }
    });

    clearAckButton?.addEventListener("click", async () => {
        clearAckButton.disabled = true;
        setStatus("Clearing submission...");

        const nextRows = upsertTaskTopicSubmissionEvidenceRows(evidenceRows, standardKey, {
            writtenEvidence: submission.writtenEvidence,
            evidenceLink: submission.evidenceLink,
            fileName: submission.fileName,
            fileUrl: submission.fileUrl,
            submittedAt: "",
            haparaAcknowledged: false,
            haparaSubmittedAt: "",
            haparaLocation: haparaSpaceName,
            haparaDriveClassUrl: haparaClassDriveUrl,
            haparaDocumentRef: String(docRefInput?.value || "").trim(),
            googleSlidesUrl: toSafeExternalUrl(googleSlidesInput?.value || ""),
            trelloCardUrl: toSafeTrelloCardUrl(trelloCardInput?.value || ""),
            trelloLastLogDate: submission.trelloLastLogDate,
            trelloLastLogAt: submission.trelloLastLogAt,
            trelloLastLogNote: submission.trelloLastLogNote,
            mediaAssetFolderUrl: toSafeExternalUrl(oneDriveFolderInput?.value || "") || toSafeExternalUrl(mediaAssetInput?.value || ""),
            mediaReviewUrl: toSafeExternalUrl(mediaReviewInput?.value || ""),
            mediaVersionLogDate: submission.mediaVersionLogDate,
            mediaVersionLogAt: submission.mediaVersionLogAt,
            mediaVersionLogNote: submission.mediaVersionLogNote,
            reviewStatus: submission.reviewStatus
        });

        try {
            await saveEvidenceRows(projectId, email, nextRows);
            evidenceRows = nextRows;
            submission.haparaAcknowledged = false;
            submission.haparaSubmittedAt = "";
            submission.submittedAt = "";
            submission.googleSlidesUrl = toSafeExternalUrl(googleSlidesInput?.value || "");
            updateMeta(false, "");
            setStatus("Submission cleared.");
        } catch (_error) {
            setStatus("Could not clear submission right now.", true);
        } finally {
            if (clearAckButton && clearAckButton.isConnected) {
                clearAckButton.disabled = false;
            }
        }
    });
}

async function renderEvidenceSidebar({ host, projectId, viewerEmail, studentEmail, standards, studentLabel = "Student", taskDefaultsByStandard = {}, detailData = null, taskTopic = "" }) {
    if (!host || !studentEmail || !projectId || !Array.isArray(standards) || !standards.length) {
        return;
    }

    const existing = document.querySelector("#evidence-steps-sidebar");
    if (existing) {
        existing.remove();
    }
    const existingBackdrop = document.querySelector("#evidence-steps-backdrop");
    if (existingBackdrop) {
        existingBackdrop.remove();
    }

    const existingTriggerButton = host.querySelector("#evidence-sidebar-open");
    if (existingTriggerButton) {
        existingTriggerButton.remove();
    }

    const backdrop = document.createElement("div");
    backdrop.id = "evidence-steps-backdrop";
    backdrop.className = "evidence-sidebar-backdrop";

    const sidebar = document.createElement("aside");
    sidebar.id = "evidence-steps-sidebar";
    sidebar.className = "evidence-sidebar";
    sidebar.setAttribute("aria-label", "Evidence steps sidebar");

    const closeSidebar = () => {
        sidebar.classList.remove("is-open");
        backdrop.classList.remove("is-open");
    };

    const openSidebar = () => {
        sidebar.classList.add("is-open");
        backdrop.classList.add("is-open");
    };

    const isSelfTaskListView = normalizeEmail(viewerEmail) === normalizeEmail(studentEmail);
    const contextSignals = [
        String(taskTopic || ""),
        String(detailData?.subjectStream || detailData?.subject_stream || detailData?.subject || ""),
        String(detailData?.type || ""),
        String(detailData?.title || "")
    ].join(" ").toUpperCase();
    const isDigitalMediaTaskContext = /(DIGITAL\s*MEDIA|MEDIA|FILM|VIDEO|AUDIO|MUSIC|PHOTOGRAPH|ANIMATION|GRAPHIC)/i.test(contextSignals);
    const secondarySystemLabel = isDigitalMediaTaskContext ? "Cloud Folder" : "GitHub";
    const digitalOutcomeTopicType = String(detailData?.type || "").trim();
    let digitalOutcomeAllocations = [];
    if (isSelfTaskListView) {
        try {
            const response = await fetch("/api/my-allocations", {
                headers: buildWriteHeaders()
            });
            if (response.ok) {
                const payload = await response.json().catch(() => ({}));
                const assessments = (Array.isArray(payload?.assessment_tasks) ? payload.assessment_tasks : [])
                    .map((item) => ({
                        id: String(item?.id || "").trim(),
                        name: String(item?.name || "Untitled").trim() || "Untitled",
                        topicType: String(item?.topic_type || "").trim(),
                        kind: "Assessment"
                    }));
                const projects = (Array.isArray(payload?.projects) ? payload.projects : [])
                    .map((item) => ({
                        id: String(item?.id || "").trim(),
                        name: String(item?.name || "Untitled").trim() || "Untitled",
                        topicType: String(item?.topic_type || "").trim(),
                        kind: "Project"
                    }));

                const byId = new Map();
                [...assessments, ...projects].forEach((item) => {
                    if (!item.id) return;
                    byId.set(item.id, item);
                });
                digitalOutcomeAllocations = Array.from(byId.values());
            }
        } catch (_error) {
            digitalOutcomeAllocations = [];
        }
    }
    const loadRowsForSidebar = async () => {
        if (isSelfTaskListView) {
            try {
                return await fetchMyEvidenceRows(projectId);
            } catch (error) {
                if (Number(error?.status || 0) !== 404) {
                    throw error;
                }
                return [];
            }
        }

        return fetchEvidenceRows(projectId, studentEmail);
    };

    const saveRowsForSidebar = async (rows) => {
        if (isSelfTaskListView) {
            try {
                await saveMyEvidenceRows(projectId, rows);
                return;
            } catch (error) {
                if (Number(error?.status || 0) !== 404) {
                    throw error;
                }
                await fetchEvidenceRowsEnsuringAllocation(projectId, studentEmail);
                await saveMyEvidenceRows(projectId, rows);
                return;
            }
        }

        await saveEvidenceRows(projectId, studentEmail, rows);
    };

    const state = evidenceRowsToMap(await loadRowsForSidebar().catch(() => []));
    standards.forEach((code) => {
        const hasExistingStandard = Object.prototype.hasOwnProperty.call(state, code);
        const shouldSeedDefaults = !hasExistingStandard || (!isSelfTaskListView && (!Array.isArray(state[code]) || !state[code].length));
        if (shouldSeedDefaults) {
            const defaultSteps = Array.isArray(taskDefaultsByStandard?.[code])
                ? taskDefaultsByStandard[code]
                : (Array.isArray(EVIDENCE_STEPS_DEFAULTS[code]) ? EVIDENCE_STEPS_DEFAULTS[code] : [""]);

            state[code] = defaultSteps
                .map((text) => ({ text: String(text || "").trim(), done: false }))
                .filter((step) => step.text);
            if (!state[code].length) {
                state[code] = [{ text: "", done: false }];
            }
        }

        if (!isSelfTaskListView && String(code) === "91897") {
            const defaultsFor91897 = Array.isArray(taskDefaultsByStandard?.[code]) ? taskDefaultsByStandard[code] : [];
            state[code] = normalize91897RowsWithRequirementFallback(state[code], defaultsFor91897);
        }
    });

    const persistState = async (statusHost) => {
        if (statusHost) {
            statusHost.textContent = "Saving...";
            statusHost.classList.remove("is-error");
        }
        try {
            const allStandards = Array.from(new Set([
                ...(Array.isArray(standards) ? standards : []),
                ...Object.keys(state)
            ]));
            await saveRowsForSidebar(evidenceMapToRows(state, allStandards));
            if (statusHost) {
                statusHost.textContent = "Saved.";
                statusHost.classList.remove("is-error");
            }
        } catch (_error) {
            if (statusHost) {
                statusHost.textContent = "Could not save right now.";
                statusHost.classList.add("is-error");
            }
        }
    };

    const getStepLevel = (text) => {
        const normalized = String(text || "").trim().toLowerCase();
        if (normalized.startsWith("achieved:")) return "Achieved";
        if (normalized.startsWith("merit:")) return "Merit";
        if (normalized.startsWith("excellence:")) return "Excellence";
        return "";
    };

    const stripStepLevel = (text) => String(text || "").replace(/^(Achieved|Merit|Excellence):\s*/i, "").trim();

    const inferStudentSystemConnections = () => {
        let trelloConnected = Boolean(toSafeTrelloCardUrl(readStoredTrelloCardLink(projectId, studentEmail)))
            || readStoredTrelloCardLibrary(projectId, studentEmail).length > 0;
        let githubConnected = false;
        let oneDriveConnected = false;
        let googleDriveConnected = false;
        let googleSlidesConnected = false;

        Object.values(state).forEach((steps) => {
            (Array.isArray(steps) ? steps : []).forEach((step) => {
                const text = String(step?.text || "").trim();
                if (!text) {
                    return;
                }

                const textLower = text.toLowerCase();
                if (text.startsWith("TRELLO_CARD_URL|")) {
                    const trelloUrl = toSafeTrelloCardUrl(text.slice("TRELLO_CARD_URL|".length).trim());
                    if (trelloUrl) {
                        trelloConnected = true;
                    }
                }

                if (textLower.includes("trello.com/")) {
                    trelloConnected = true;
                }

                if (/(github\.com|gist\.github\.com|raw\.githubusercontent\.com)/i.test(textLower)) {
                    githubConnected = true;
                }

                if (text.startsWith("GOOGLE_SLIDES_URL|")) {
                    const slidesUrl = toSafeExternalUrl(text.slice("GOOGLE_SLIDES_URL|".length).trim());
                    if (slidesUrl) {
                        googleSlidesConnected = true;
                    }
                }

                if (/(docs\.google\.com\/presentation)/i.test(textLower)) {
                    googleSlidesConnected = true;
                }

                if (text.startsWith("MEDIA_ASSET_FOLDER_URL|") || text.startsWith("MEDIA_REVIEW_URL|") || text.startsWith("ONEDRIVE_PROJECT_FOLDER_URL|")) {
                    oneDriveConnected = true;
                }

                if (text.startsWith("GOOGLE_DRIVE_PROJECT_FOLDER_URL|")) {
                    const driveUrl = toSafeExternalUrl(text.slice("GOOGLE_DRIVE_PROJECT_FOLDER_URL|".length).trim());
                    if (driveUrl) {
                        googleDriveConnected = true;
                    }
                }

                if (/(onedrive\.live\.com|1drv\.ms|sharepoint\.com|onedrive)/i.test(textLower)) {
                    oneDriveConnected = true;
                }

                if (/(drive\.google\.com)/i.test(textLower)) {
                    googleDriveConnected = true;
                }
            });
        });

        return {
            trelloConnected,
            githubConnected,
            oneDriveConnected,
            googleDriveConnected,
            googleSlidesConnected
        };
    };

    const hasSyncedSlideForTaskTopic = (taskTopicText) => {
        const safeTopic = String(taskTopicText || "").trim();
        const lookupEmail = normalizeEmail(studentEmail || viewerEmail || readStoredHubEmail());
        if (!safeTopic || !projectId || !lookupEmail) {
            return false;
        }

        const derivedShort = deriveTaskShortName(safeTopic);
        const withShort = readStoredTaskTopicSlideSyncEntry(projectId, lookupEmail, safeTopic, derivedShort);
        if (isCompletionEligibleSyncEntry(withShort, safeTopic)) {
            return true;
        }

        const byShort = readStoredTaskTopicSlideSyncEntryByShortName(projectId, lookupEmail, derivedShort);
        if (isCompletionEligibleSyncEntry(byShort, safeTopic)) {
            return true;
        }

        const withoutShort = readStoredTaskTopicSlideSyncEntry(projectId, lookupEmail, safeTopic, "");
        return isCompletionEligibleSyncEntry(withoutShort, safeTopic);
    };

    let showTaskDetail = () => {};
    const openTaskTopicCard = ({ text, topicIndex }) => {
        const safeText = String(text || "").trim();
        if (!safeText) {
            return;
        }

        const taskShortName = getTaskTopicShortNameOverride(projectId, safeText) || deriveTaskShortName(safeText);

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("id", String(projectId || ""));
        nextUrl.searchParams.set("taskTopic", safeText);
        nextUrl.searchParams.set("taskShortName", taskShortName);
        nextUrl.searchParams.set("taskList", "hide");
        if (Number.isFinite(Number(topicIndex)) && Number(topicIndex) > 0) {
            nextUrl.searchParams.set("taskTopicIndex", String(topicIndex));
        }

        // Close the sidebar first so users get immediate visual feedback.
        closeSidebar();
        window.setTimeout(() => {
            window.location.href = `${nextUrl.pathname}${nextUrl.search}`;
        }, 90);
    };

    const renderStepRows = (rowsHost, standardCode, levelFilter = "") => {
        const steps = Array.isArray(state[standardCode]) ? state[standardCode] : [];
        rowsHost.innerHTML = "";
        const systemConnections = inferStudentSystemConnections();

        const filtered = steps
            .map((step, index) => ({ step, index }))
            .filter(({ step }) => {
                if (isSelfTaskListView && window.hubShouldHideStudentAssessmentTask?.(standardCode, step?.text)) {
                    return false;
                }
                if (!levelFilter) {
                    return true;
                }

                const level = getStepLevel(step?.text);
                return level === levelFilter;
            });

        if (String(standardCode) === "91897" && String(levelFilter || "").toLowerCase() === "achieved") {
            const subitemIndex = filtered.findIndex(({ step }) => isFeaturesRequirementSubitem(step?.text));
            const parentIndex = filtered.findIndex(({ step }) => isDecompositionParentStep(step?.text));
            if (subitemIndex >= 0 && parentIndex >= 0 && subitemIndex !== parentIndex + 1) {
                const [subitemRow] = filtered.splice(subitemIndex, 1);
                const insertAt = subitemIndex < parentIndex ? parentIndex : parentIndex + 1;
                filtered.splice(insertAt, 0, subitemRow);
            }
        }

        if (!filtered.length && levelFilter) {
            const empty = document.createElement("p");
            empty.className = "evidence-level-empty";
            empty.textContent = `No ${levelFilter.toLowerCase()} tasks yet.`;
            rowsHost.appendChild(empty);
            return;
        }

        let autoUpdated = false;

        filtered.forEach(({ step, index }) => {
            const row = document.createElement("div");
            row.className = "evidence-step-row";
            if (String(standardCode) === "91897" && String(levelFilter || "").toLowerCase() === "achieved" && isFeaturesRequirementSubitem(step?.text)) {
                row.classList.add("is-subitem");
            }

            const rowLevel = String(levelFilter || getStepLevel(step?.text)).trim().toLowerCase();
            const rowTaskText = stripStepLevel(step?.text).toLowerCase();
            const autoCompleteProjectManagementRow = String(standardCode) === "91897"
                && rowLevel === "achieved"
                && rowTaskText.includes("project management")
                && systemConnections.trelloConnected
                && systemConnections.githubConnected;
            const autoCompleteDigitalOutcomeTemplateRow = String(standardCode) === "digital-outcome"
                && (rowTaskText.includes("describe the digital outcome")
                    || rowTaskText.includes("identify the target audience")
                    || rowTaskText.includes("end user for this outcome")
                    || rowTaskText.includes("outcome will be developed")
                    || rowTaskText.includes("tools/technologies")
                    || rowTaskText.includes("success will be measured")
                    || rowTaskText.includes("success will be evaluated"))
                && hasSyncedSlideForTaskTopic(levelFilter ? stripStepLevel(step?.text) : String(step?.text || ""));

            const isAutoManagedDigitalOutcomeTemplateRow = String(standardCode) === "digital-outcome"
                && (rowTaskText.includes("describe the digital outcome")
                    || rowTaskText.includes("identify the target audience")
                    || rowTaskText.includes("end user for this outcome")
                    || rowTaskText.includes("outcome will be developed")
                    || rowTaskText.includes("tools/technologies")
                    || rowTaskText.includes("success will be measured")
                    || rowTaskText.includes("success will be evaluated"));

            if (isAutoManagedDigitalOutcomeTemplateRow && !autoCompleteDigitalOutcomeTemplateRow && Boolean(step?.done)) {
                state[standardCode][index].done = false;
                step.done = false;
                autoUpdated = true;
            }

            if (autoCompleteProjectManagementRow) {
                row.classList.add("is-system-complete");
            }

            if (autoCompleteDigitalOutcomeTemplateRow) {
                row.classList.add("is-system-complete");
            }

            const doneValue = Boolean(step?.done) || autoCompleteProjectManagementRow || autoCompleteDigitalOutcomeTemplateRow;
            if (autoCompleteProjectManagementRow && !Boolean(step?.done)) {
                state[standardCode][index].done = true;
                step.done = true;
                autoUpdated = true;
            }

            if (autoCompleteDigitalOutcomeTemplateRow && !Boolean(step?.done)) {
                state[standardCode][index].done = true;
                step.done = true;
                autoUpdated = true;
            }

            const check = document.createElement("input");
            check.type = "checkbox";
            check.className = "evidence-step-check";
            check.checked = doneValue;
            check.addEventListener("change", () => {
                state[standardCode][index].done = check.checked;
                void persistState(sidebar.querySelector("#evidence-sidebar-status"));
            });

            const input = document.createElement("input");
            input.type = "text";
            input.className = "evidence-step-input";
            input.value = levelFilter ? stripStepLevel(step?.text) : String(step?.text || "");
            input.placeholder = levelFilter ? `Add ${levelFilter.toLowerCase()} task` : "Add a task item";
            input.title = levelFilter ? stripStepLevel(step?.text) : String(step?.text || "");
            input.addEventListener("click", () => {
                openTaskTopicCard({
                    text: levelFilter ? stripStepLevel(step?.text) : String(step?.text || ""),
                    topicIndex: index + 1
                });
            });
            input.addEventListener("input", () => {
                const nextText = String(input.value || "").trim();
                state[standardCode][index].text = levelFilter ? `${levelFilter}: ${nextText}` : nextText;
                input.title = nextText;
                showTaskDetail({
                    standardCode,
                    level: levelFilter || getStepLevel(state[standardCode][index].text),
                    text: nextText
                });
                void persistState(sidebar.querySelector("#evidence-sidebar-status"));
            });

            row.append(check, input);

            if (!isSelfTaskListView) {
                const removeButton = document.createElement("button");
                removeButton.type = "button";
                removeButton.className = "evidence-step-remove";
                removeButton.textContent = "Remove";
                removeButton.addEventListener("click", () => {
                    state[standardCode].splice(index, 1);
                    if (!state[standardCode].length) {
                        const fallbackText = levelFilter ? `${levelFilter}: ` : "";
                        state[standardCode].push({ text: fallbackText, done: false });
                    }
                    void persistState(sidebar.querySelector("#evidence-sidebar-status"));
                    renderStepRows(rowsHost, standardCode, levelFilter);
                });

                row.append(removeButton);
            }

            const showProjectManagementConnections = String(standardCode) === "91897"
                && rowLevel === "achieved"
                && rowTaskText.includes("project management");
            if (showProjectManagementConnections) {
                const systems = document.createElement("div");
                systems.className = "evidence-step-system-list";
                systems.innerHTML = `
                    <p class="evidence-step-system-title">Connected Systems</p>
                    <label class="evidence-step-system-item"><input type="checkbox" disabled ${systemConnections.trelloConnected ? "checked" : ""}> Trello</label>
                    <label class="evidence-step-system-item"><input type="checkbox" disabled ${systemConnections.githubConnected ? "checked" : ""}> GitHub</label>
                    <label class="evidence-step-system-item"><input type="checkbox" disabled ${systemConnections.oneDriveConnected ? "checked" : ""}> OneDrive</label>
                    <label class="evidence-step-system-item"><input type="checkbox" disabled ${systemConnections.googleDriveConnected ? "checked" : ""}> Google Drive</label>
                `;
                row.appendChild(systems);
            }

            rowsHost.appendChild(row);
        });

        if (autoUpdated) {
            void persistState(sidebar.querySelector("#evidence-sidebar-status"));
        }
    };

    sidebar.innerHTML = `
        <header class="evidence-sidebar-header">
            <h2>Task List</h2>
            <button type="button" class="detail-action detail-action-secondary" id="evidence-sidebar-close">Close</button>
        </header>
        <p class="evidence-sidebar-copy">Tracking for <strong>${escapeHtml(studentLabel)}</strong>. Tick each requirement when evidence is complete.</p>
        <p class="evidence-sidebar-status" id="evidence-sidebar-status" aria-live="polite"></p>
        <section class="evidence-task-detail" id="evidence-task-detail" hidden>
            <h3>Task Details</h3>
            <p class="evidence-task-detail-meta" id="evidence-task-detail-meta"></p>
            <p class="evidence-task-detail-text" id="evidence-task-detail-text"></p>
        </section>
        <div class="evidence-standard-list" id="evidence-standard-list"></div>
    `;

    const taskDetailHost = sidebar.querySelector("#evidence-task-detail");
    const taskDetailMeta = sidebar.querySelector("#evidence-task-detail-meta");
    const taskDetailText = sidebar.querySelector("#evidence-task-detail-text");

    showTaskDetail = ({ standardCode, level, text }) => {
        const safeText = String(text || "").trim();
        if (!taskDetailHost || !taskDetailMeta || !taskDetailText || !safeText) {
            return;
        }

        const levelText = String(level || "").trim();
        taskDetailMeta.textContent = levelText
            ? `Standard ${standardCode} • ${levelText}`
            : `Standard ${standardCode}`;
        taskDetailText.textContent = safeText;
        taskDetailHost.hidden = false;
    };

    const standardsHost = sidebar.querySelector("#evidence-standard-list");

    // Always render a Digital Outcome Details block above the standards for assessment tasks.
    (() => {
        const doCode = "digital-outcome";
        if (!Object.prototype.hasOwnProperty.call(state, doCode)) {
            state[doCode] = DIGITAL_OUTCOME_DETAILS_TASKS.map((text) => ({ text, done: false }));
        }
        const doBlock = document.createElement("section");
        doBlock.className = "evidence-standard-block evidence-digital-outcome-block";
        doBlock.innerHTML = `
            <h3 class="evidence-digital-outcome-heading">Digital Outcome Topic</h3>
            <div class="evidence-step-list evidence-digital-outcome-topic-list">
                <div class="evidence-step-row evidence-step-row-readonly">
                    <input
                        type="text"
                        class="evidence-step-input"
                        value="${escapeHtml(digitalOutcomeTopicType || "Not Set") }"
                        title="${escapeHtml(digitalOutcomeTopicType || "Topic Type not set on Upload Assessment Task page") }"
                        readonly
                    >
                </div>
            </div>
            <h3 class="evidence-digital-outcome-heading">Digital Outcome Description</h3>
            <div class="evidence-step-list" id="evidence-step-list-digital-outcome"></div>
            ${!isSelfTaskListView ? `<button type="button" class="detail-action detail-action-secondary evidence-step-add" data-do-add>Add Step</button>` : ""}
        `;
        const doRowsHost = doBlock.querySelector("#evidence-step-list-digital-outcome");
        const doAddButton = doBlock.querySelector("[data-do-add]");
        if (doAddButton) {
            doAddButton.addEventListener("click", () => {
                state[doCode].push({ text: "", done: false });
                void persistState(sidebar.querySelector("#evidence-sidebar-status"));
                renderStepRows(doRowsHost, doCode);
            });
        }
        renderStepRows(doRowsHost, doCode);
        standardsHost.appendChild(doBlock);
    })();

    standards.forEach((code) => {
        const block = document.createElement("section");
        block.className = "evidence-standard-block";
        if (String(code) === "91897") {
            const levels = ["Achieved", "Merit", "Excellence"];
            block.innerHTML = `
                <h3>Standard ${escapeHtml(code)}</h3>
                ${levels.map((level) => `
                    <div class="evidence-level-group" data-level="${escapeHtml(level)}">
                        <h4>${escapeHtml(level)}</h4>
                        <div class="evidence-step-list" id="evidence-step-list-${escapeHtml(code)}-${escapeHtml(level.toLowerCase())}"></div>
                        <button type="button" class="detail-action detail-action-secondary evidence-step-add" data-add-level="${escapeHtml(level)}">Add ${escapeHtml(level)} Step</button>
                    </div>
                `).join("")}
            `;

            const renderGrouped = () => {
                levels.forEach((level) => {
                    const rowsHost = block.querySelector(`#evidence-step-list-${code}-${level.toLowerCase()}`);
                    if (rowsHost) {
                        renderStepRows(rowsHost, code, level);
                    }
                });
            };

            block.querySelectorAll(".evidence-step-add").forEach((button) => {
                button.addEventListener("click", () => {
                    const level = String(button.getAttribute("data-add-level") || "").trim();
                    const seedText = level ? `${level}: ` : "";
                    state[code].push({ text: seedText, done: false });
                    void persistState(sidebar.querySelector("#evidence-sidebar-status"));
                    renderGrouped();
                });
            });

            renderGrouped();
        } else {
            block.innerHTML = `
                <h3>Standard ${escapeHtml(code)}</h3>
                <div class="evidence-step-list" id="evidence-step-list-${escapeHtml(code)}"></div>
                <button type="button" class="detail-action detail-action-secondary evidence-step-add">Add Step</button>
            `;

            const rowsHost = block.querySelector(`#evidence-step-list-${code}`);
            const addButton = block.querySelector(".evidence-step-add");
            if (addButton) {
                addButton.addEventListener("click", () => {
                    state[code].push({ text: "", done: false });
                    void persistState(sidebar.querySelector("#evidence-sidebar-status"));
                    renderStepRows(rowsHost, code);
                });
            }

            renderStepRows(rowsHost, code);
        }

        standardsHost.appendChild(block);
    });

    const closeButton = sidebar.querySelector("#evidence-sidebar-close");
    closeButton?.addEventListener("click", closeSidebar);
    backdrop.addEventListener("click", closeSidebar);

    document.body.appendChild(backdrop);
    document.body.appendChild(sidebar);

    const openButton = host.querySelector("#evidence-sidebar-open");
    openButton?.addEventListener("click", openSidebar);
}

let detailStandardsOptionsCache = null;

function extractStandardCodeFromLabel(value) {
    const match = String(value || "").match(/\b(\d{5})\b/);
    return match ? String(match[1] || "").trim() : "";
}

function getToolsCategoryForTopicType(topicType) {
    const t = String(topicType || "").trim().toLowerCase();
    if (/programm|coding|comput|software|python|javascript|java|react|node/i.test(t)) return "programming";
    if (/web|html|css|frontend|ui\s*design/i.test(t)) return "web";
    if (/design|ux|graphic|visual|figma|adobe/i.test(t)) return "design";
    if (/digital\s*media|media|film|video|audio|music|photograph|animation/i.test(t)) return "digital-media";
    if (/data|analytic|excel|sql|statistic|business/i.test(t)) return "data";
    return "general";
}

async function renderToolsTechniquesPanel({ host, projectId, detailData, taskTopic = "" }) {
    if (!host) return;

    const existingContextCard = host.querySelector("#tools-project-context-card");
    if (existingContextCard) existingContextCard.remove();

    const existingPanel = host.querySelector("#tools-techniques-panel");
    if (existingPanel) {
        existingPanel.remove();
    }

    const email = readStoredHubEmail();
    if (!email) return;

    // Fetch student's allocations for project context card
    let allAllocations = [];
    try {
        const allocPayload = await fetch("/api/my-allocations", { headers: buildWriteHeaders() })
            .then((r) => r.json()).catch(() => ({}));
        allAllocations = [
            ...(Array.isArray(allocPayload?.assessment_tasks) ? allocPayload.assessment_tasks : []),
            ...(Array.isArray(allocPayload?.projects) ? allocPayload.projects : [])
        ].filter((a) => String(a?.id || "").trim() && !/^client projects$/i.test(String(a?.name || a?.title || "").trim()));
    } catch (_error) {
        // Continue without project context if fetch fails
    }

    // Determine initial selected allocation and topic type
    const currentAlloc = allAllocations.find((a) => String(a.id) === String(projectId))
        || allAllocations[0] || null;
    const getTopicTypes = (alloc) => {
        const raw = String(alloc?.type || alloc?.topic_type || "").trim();
        return raw ? raw.split(/[,;|]+/).map((s) => s.trim()).filter(Boolean) : [];
    };
    const initialTypes = getTopicTypes(currentAlloc);
    const initialType = initialTypes[0] || "";

    // Track active state
    let activeAllocId = currentAlloc ? String(currentAlloc.id) : "";
    let activeTopicType = initialType;

    const digitalMediaContextCard = document.createElement("section");
    digitalMediaContextCard.id = "tools-digital-media-context-card";
    digitalMediaContextCard.className = "tools-project-context-card proposal-section";

    const renderDigitalMediaContextCard = () => {
        const activeAlloc = allAllocations.find((allocation) => String(allocation.id) === activeAllocId) || null;
        const projectTaskStandard = String(activeAlloc?.standard_2 || "").match(/\b(91893|91903)\b/)?.[1] || "";
        const digitalMediaType = String(activeAlloc?.digital_media_type || "").trim();
        const isDigitalMedia = Boolean(projectTaskStandard || digitalMediaType);
        const guidanceByStandard = projectTaskStandard === "91903"
            ? DIGITAL_MEDIA_91903_GUIDANCE
            : projectTaskStandard === "91893"
                ? DIGITAL_MEDIA_91893_GUIDANCE
                : null;
        const guidance = guidanceByStandard?.[digitalMediaType.toLowerCase()] || null;
        digitalMediaContextCard.hidden = !isDigitalMedia;
        digitalMediaContextCard.innerHTML = isDigitalMedia ? `
            <h2>Student Details</h2>
            <div class="tools-context-type-chips">
                <span class="tools-context-type-label">Digital Media:</span>
                ${projectTaskStandard ? `<span class="tools-context-type-chip is-active">Standard ${escapeHtml(projectTaskStandard)}</span>` : ""}
                ${digitalMediaType ? `<span class="tools-context-type-chip is-active">${escapeHtml(digitalMediaType)}</span>` : ""}
            </div>
            ${guidance ? `
                <section class="tools-media-guidance">
                    <h3>${escapeHtml(guidance.heading)}</h3>
                    <div class="tools-media-guidance-table-wrap">
                        <table class="tools-media-guidance-table">
                            <thead><tr><th>${escapeHtml(guidance.categoryHeading || "Current NZQA category")}</th><th>${escapeHtml(guidance.examplesHeading)}</th></tr></thead>
                            <tbody>${guidance.rows.map(([category, examples]) => `<tr><td>${escapeHtml(category)}</td><td>${escapeHtml(examples)}</td></tr>`).join("")}</tbody>
                        </table>
                    </div>
                </section>
            ` : ""}
        ` : "";
    };

    // --- Project Context Card ---
    const contextCard = document.createElement("section");
    contextCard.id = "tools-project-context-card";
    contextCard.className = "tools-project-context-card proposal-section";

    const renderContextCard = () => {
        const activeAlloc = allAllocations.find((a) => String(a.id) === activeAllocId) || allAllocations[0];
        const activeTypes = getTopicTypes(activeAlloc);

        const projectListHtml = allAllocations.length > 1
            ? `<div class="tools-context-project-list">
                ${allAllocations.map((alloc) => {
                    const allocId = String(alloc.id);
                    const isActive = allocId === activeAllocId;
                    const types = getTopicTypes(alloc);
                    return `<button type="button"
                        class="tools-context-project-item ${isActive ? "is-active" : ""}"
                        data-context-project-id="${escapeHtml(allocId)}">
                        <span class="tools-context-project-name">${escapeHtml(String(alloc.name || alloc.title || "Project").trim())}</span>
                        ${types.length ? `<span class="tools-context-project-type">${escapeHtml(types.join(", "))}</span>` : ""}
                    </button>`;
                }).join("")}
               </div>`
            : activeAlloc
                ? `<p class="tools-context-single-project">${escapeHtml(String(activeAlloc.name || activeAlloc.title || "").trim())}</p>`
                : "";

        const topicChipsHtml = activeTypes.length
            ? `<div class="tools-context-type-chips">
                <span class="tools-context-type-label">Topic Type:</span>
                ${activeTypes.map((t) => `
                    <button type="button"
                        class="tools-context-type-chip ${t === activeTopicType ? "is-active" : ""}"
                        data-context-type="${escapeHtml(t)}">
                        ${escapeHtml(t)}
                    </button>`).join("")}
               </div>`
            : "";

        contextCard.innerHTML = `
            <h2>${allAllocations.length > 1 ? "Which Project?" : "Project"}</h2>
            ${projectListHtml}
            ${topicChipsHtml}
        `;
    };

    renderContextCard();
    host.appendChild(contextCard);
    renderDigitalMediaContextCard();
    host.appendChild(digitalMediaContextCard);

    // Event delegation for context card interactions
    contextCard.addEventListener("click", (e) => {
        const projectBtn = e.target.closest("[data-context-project-id]");
        const typeBtn = e.target.closest("[data-context-type]");
        if (projectBtn) {
            activeAllocId = projectBtn.getAttribute("data-context-project-id") || activeAllocId;
            const newTypes = getTopicTypes(allAllocations.find((a) => String(a.id) === activeAllocId));
            activeTopicType = newTypes[0] || "";
            renderContextCard();
            renderDigitalMediaContextCard();
            updateSuggestions();
        } else if (typeBtn) {
            activeTopicType = typeBtn.getAttribute("data-context-type") || "";
            renderContextCard();
            updateSuggestions();
        }
    });

    const panel = document.createElement("section");
    panel.id = "tools-techniques-panel";
    panel.className = "tools-techniques-panel proposal-section";

    const buildSuggestionsHtml = (topicTypeOverride) => {
        const activeAlloc = allAllocations.find((allocation) => String(allocation.id) === activeAllocId) || null;
        const digitalMediaType = String(activeAlloc?.digital_media_type || "").trim().toLowerCase();
        const mediaCategory = ["image", "video", "audio", "web"].includes(digitalMediaType)
            ? digitalMediaType
            : (digitalMediaType === "mixed" ? "digital-media" : "");
        const category = mediaCategory || (topicTypeOverride
            ? getToolsCategoryForTopicType(topicTypeOverride)
            : "");
        const tools = category
            ? (SUGGESTED_TOOLS_BY_CONTEXT[category] || SUGGESTED_TOOLS_BY_CONTEXT.general)
            : getSuggestedToolsForContext(detailData, taskTopic);
        return tools.length
            ? `<div class="tools-suggestions" id="tools-suggestions-section">
                <h3>Suggested Tools</h3>
                <div class="tools-suggestions-grid">
                    ${tools.map((tool) => `
                        <button type="button" class="tools-suggestion-chip" data-tool-name="${escapeHtml(tool)}">
                            ${escapeHtml(tool)}
                        </button>
                    `).join("")}
                </div>
               </div>`
            : `<div id="tools-suggestions-section"></div>`;
    };

    const updateSuggestions = () => {
        const existing = panel.querySelector("#tools-suggestions-section");
        if (existing) existing.outerHTML = buildSuggestionsHtml(activeTopicType);
        // Re-attach chip listeners after DOM update
        panel.querySelectorAll(".tools-suggestion-chip").forEach((chip) => {
            chip.addEventListener("click", () => addToolFromChip(chip.getAttribute("data-tool-name")));
        });
    };

    panel.innerHTML = `
        <h2>Tools & Techniques</h2>
        <p class="tools-instructions">List the tools you intend to use, are currently using, or have used for this task. For each tool, describe the techniques or methods you implemented with it.</p>
        ${buildSuggestionsHtml(activeTopicType)}
        <div class="tools-technique-suggestions" id="tools-technique-suggestions" hidden aria-live="polite"></div>
        <div class="tools-table-wrapper">
            <table class="tools-table" id="tools-table">
                <thead>
                    <tr>
                        <th>Tool Name</th>
                        <th>Status</th>
                        <th>Techniques Implemented</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="tools-tbody">
                </tbody>
            </table>
        </div>
        <div class="tools-actions">
            <button type="button" class="detail-action detail-action-secondary" id="add-tool-row-btn">+ Add Tool</button>
            <button type="button" class="detail-action detail-action-secondary" id="push-tools-trello-btn">&#x21bb; Push to Trello To Do</button>
        </div>
        <p class="tools-status" id="tools-status" aria-live="polite"></p>
        <p class="tools-status" id="tools-trello-push-status" aria-live="polite"></p>
    `;

    host.appendChild(panel);

    let toolsData = [];
    try {
        toolsData = await fetchMyToolsTechniques(projectId);
    } catch (_error) {
        // Start with empty list if fetch fails
        toolsData = [];
    }

    const tbody = panel.querySelector("#tools-tbody");
    const statusEl = panel.querySelector("#tools-status");
    const techniqueSuggestionsHost = panel.querySelector("#tools-technique-suggestions");
    let saveTimer = null;

    const renderTable = () => {
        tbody.innerHTML = toolsData.map((item, index) => `
            <tr class="tools-row" data-row-id="${escapeHtml(item.id)}">
                <td>
                    <input type="text" class="tools-input tools-tool-name" value="${escapeHtml(item.toolName)}" placeholder="e.g., Python, Figma, GitHub" data-row-index="${index}">
                </td>
                <td>
                    <select class="tools-select tools-status-select" data-row-index="${index}">
                        <option value="Intend to Use" ${item.status === "Intend to Use" ? "selected" : ""}>Intend to Use</option>
                        <option value="Currently Using" ${item.status === "Currently Using" ? "selected" : ""}>Currently Using</option>
                        <option value="Have Used" ${item.status === "Have Used" ? "selected" : ""}>Have Used</option>
                    </select>
                </td>
                <td>
                    <textarea class="tools-input tools-techniques" placeholder="Describe the techniques or methods you used..." data-row-index="${index}">${escapeHtml(item.techniques)}</textarea>
                </td>
                <td>
                    <button type="button" class="detail-action detail-action-secondary tools-delete-btn" data-row-index="${index}" title="Delete this row">×</button>
                </td>
            </tr>
        `).join("");
    };

    const saveData = async () => {
        try {
            statusEl.textContent = "Saving...";
            statusEl.classList.remove("is-error");

            const rows = Array.from(tbody.querySelectorAll(".tools-row")).map((row) => ({
                id: row.getAttribute("data-row-id"),
                toolName: row.querySelector(".tools-tool-name").value.trim(),
                status: row.querySelector(".tools-status-select").value,
                techniques: row.querySelector(".tools-techniques").value.trim(),
                createdAt: toolsData.find((t) => t.id === row.getAttribute("data-row-id"))?.createdAt || new Date().toISOString()
            })).filter((r) => r.toolName);

            await saveMyToolsTechniques(projectId, rows);
            toolsData = rows;
            renderTable();
            statusEl.textContent = "Saved successfully";
            setTimeout(() => { statusEl.textContent = ""; }, 2000);
        } catch (error) {
            statusEl.textContent = `Error: ${String(error?.message || "Could not save")}`;
            statusEl.classList.add("is-error");
        }
    };

    const scheduleSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void saveData();
        }, 600);
    };

    const normalizeToolName = (value) => String(value || "")
        .trim()
        .toLowerCase()
        .replace(/visual studio code/g, "vs code")
        .replace(/[^a-z0-9+#/]+/g, " ")
        .trim();

    const getSuggestedTechniques = (toolName) => {
        const key = normalizeToolName(toolName);
        return SUGGESTED_TECHNIQUES_BY_TOOL[key]
            || ["Plan the workflow", "Use relevant features", "Test the result", "Record improvements"];
    };

    const renderTechniqueSuggestions = (toolName, rowId) => {
        if (!techniqueSuggestionsHost || !rowId) return;
        const techniques = getSuggestedTechniques(toolName);
        techniqueSuggestionsHost.hidden = false;
        techniqueSuggestionsHost.innerHTML = `
            <p class="tools-technique-suggestions-title">Suggested techniques for <strong>${escapeHtml(toolName)}</strong></p>
            <div class="tools-technique-suggestions-list">
                ${techniques.map((technique) => `
                    <button type="button" class="tools-technique-chip" data-technique-row-id="${escapeHtml(rowId)}" data-technique-value="${escapeHtml(technique)}">${escapeHtml(technique)}</button>
                `).join("")}
            </div>
        `;
    };

    renderTable();

    // Delegated listeners also cover rows added after the panel first renders.
    tbody.addEventListener("input", scheduleSave);
    tbody.addEventListener("change", () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        void saveData();
    });

    // Event listeners
    panel.querySelector("#add-tool-row-btn").addEventListener("click", () => {
        const newRow = {
            id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            toolName: "",
            status: "Intend to Use",
            techniques: "",
            createdAt: new Date().toISOString()
        };
        toolsData.push(newRow);
        renderTable();
        attachListeners();
        // Focus on the new tool name input
        setTimeout(() => {
            const lastInput = tbody.querySelector(".tools-tool-name:last-of-type");
            if (lastInput) lastInput.focus();
        }, 0);
    });

    const attachListeners = () => {
        tbody.querySelectorAll(".tools-delete-btn").forEach((btn) => {
            btn.removeEventListener("click", () => {});
            btn.addEventListener("click", async (e) => {
                const index = Number(btn.getAttribute("data-row-index"));
                toolsData.splice(index, 1);
                renderTable();
                attachListeners();
                await saveData();
            });
        });
    };

    const addToolFromChip = (toolName) => {
        if (!toolName) return;
        const lastRow = toolsData[toolsData.length - 1];
        let targetRow;
        if (lastRow && !lastRow.toolName) {
            lastRow.toolName = toolName;
            targetRow = lastRow;
        } else {
            targetRow = {
                id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                toolName,
                status: "Intend to Use",
                techniques: "",
                createdAt: new Date().toISOString()
            };
            toolsData.push(targetRow);
        }
        renderTable();
        attachListeners();
        renderTechniqueSuggestions(toolName, targetRow.id);
        void saveData();
    };

    attachListeners();

    techniqueSuggestionsHost?.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-technique-row-id]");
        if (!chip) return;
        const rowId = String(chip.getAttribute("data-technique-row-id") || "");
        const row = tbody.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`);
        const textarea = row?.querySelector(".tools-techniques");
        const technique = String(chip.getAttribute("data-technique-value") || "").trim();
        if (!textarea || !technique) return;
        const existing = String(textarea.value || "").trim();
        if (!existing.toLowerCase().includes(technique.toLowerCase())) {
            textarea.value = existing ? `${existing}; ${technique}` : technique;
            void saveData();
        }
    });

    // Attach chip listeners (also called by updateSuggestions after re-render)
    panel.querySelectorAll(".tools-suggestion-chip").forEach((chip) => {
        chip.addEventListener("click", () => addToolFromChip(chip.getAttribute("data-tool-name")));
    });

    const pushTrelloButton = panel.querySelector("#push-tools-trello-btn");
    const pushTrelloStatusEl = panel.querySelector("#tools-trello-push-status");
    const setPushStatus = (message, isError = false) => {
        if (!pushTrelloStatusEl) return;
        pushTrelloStatusEl.textContent = String(message || "");
        pushTrelloStatusEl.classList.toggle("is-error", Boolean(isError));
    };

    // Resolves the student's saved Trello board so tools can be pushed as To Do cards without a separate board picker.
    const resolveStudentTrelloBoardUrl = async () => {
        const favourite = getFavouriteTrelloCardLibraryLink(projectId, email);
        if (favourite) return favourite;

        const storedLink = toSafeTrelloCardUrl(readStoredTrelloCardLink(projectId, email))
            || toSafeTrelloCardUrl(readStoredTrelloCardLibrary(projectId, email)[0]?.url || "");
        if (storedLink) return storedLink;

        try {
            const rows = await fetchMyEvidenceRows(projectId);
            return getFirstTrelloCardUrlFromEvidenceRows(rows);
        } catch (_error) {
            return "";
        }
    };

    pushTrelloButton?.addEventListener("click", async () => {
        const toolRows = toolsData.filter((row) => String(row?.toolName || "").trim());
        if (!toolRows.length) {
            setPushStatus("Add at least one tool before pushing to Trello.", true);
            return;
        }

        pushTrelloButton.disabled = true;
        setPushStatus("Finding your Trello board...");

        try {
            const boardUrl = await resolveStudentTrelloBoardUrl();
            const boardId = extractTrelloBoardIdFromUrl(boardUrl);
            if (!boardId) {
                setPushStatus("Save your Trello board link on the Project Management page first.", true);
                return;
            }

            const listsResponse = await fetch(`/api/integrations/trello/boards/${encodeURIComponent(boardId)}/lists`, {
                headers: buildWriteHeaders()
            });
            const lists = await listsResponse.json().catch(() => []);
            if (!listsResponse.ok || !Array.isArray(lists) || !lists.length) {
                setPushStatus("Could not load your Trello lists. Make sure Trello is connected in User Profile.", true);
                return;
            }

            const todoList = lists.find((list) => /to\s*-?\s*do/i.test(String(list?.name || ""))) || lists[0];

            setPushStatus("Pushing tools to Trello To Do...");
            let createdCount = 0;
            const failedTools = [];
            const pushedToolNames = [];
            for (const row of toolRows) {
                const cardName = `${row.toolName} (${row.status})`;
                const cardDesc = String(row.techniques || "").trim() || "No techniques described yet.";
                const createResponse = await fetch("/api/integrations/trello/cards", {
                    method: "POST",
                    headers: buildWriteHeaders(),
                    body: JSON.stringify({
                        list_id: todoList.id,
                        name: cardName,
                        desc: cardDesc,
                        pos: "top"
                    })
                });

                if (!createResponse.ok) {
                    failedTools.push(row.toolName);
                    continue;
                }
                createdCount += 1;
                pushedToolNames.push(row.toolName);
            }

            // Grow the shared Tools & Techniques keyword index with these real, student-worded tool names,
            // so future Trello cards typed directly (without this button) can still be recognised.
            if (pushedToolNames.length) {
                fetch("/api/tools-techniques-keywords", {
                    method: "POST",
                    headers: buildWriteHeaders(),
                    body: JSON.stringify({ keywords: pushedToolNames })
                }).catch(() => {});
            }

            if (failedTools.length) {
                setPushStatus(`Created ${createdCount} card(s). ${failedTools.length} tool(s) could not be created.`, true);
            } else {
                setPushStatus(`Created ${createdCount} Trello To Do card${createdCount === 1 ? "" : "s"} in "${todoList.name}".`);
            }
        } catch (_error) {
            setPushStatus("Could not push tools to Trello right now.", true);
        } finally {
            if (pushTrelloButton.isConnected) pushTrelloButton.disabled = false;
        }
    });
}

async function tryAutofillDetailStandardCard(standardLabel, { onApplied } = {}) {
    const standardCode = extractStandardCodeFromLabel(standardLabel);
    if (!standardCode) return;

    const params = new URLSearchParams();
    params.set("standard", standardCode);
    params.set("year", String(new Date().getFullYear()));

    try {
        const response = await fetch(`/api/assessment-standard-cards/match?${params.toString()}`, {
            headers: buildWriteHeaders()
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.matched || !payload?.card) return;

        if (typeof onApplied === "function") {
            onApplied(payload.card);
        }
    } catch (_error) {
        // Keep the standard add flow resilient if template lookup fails.
    }
}

function applyDetailStandardCardTemplate(card, fields) {
    if (!card || typeof card !== "object") return;

    const pickLines = (textValue, checklistValue) => {
        const checklist = Array.isArray(checklistValue)
            ? checklistValue.map((line) => String(line || "").trim()).filter(Boolean)
            : [];
        if (checklist.length) return checklist;
        const text = String(textValue || "").trim();
        return text ? [text] : [];
    };

    const achievedLines = pickLines(card.achieved_text, card.achieved_checklist);
    const meritLines = pickLines(card.merit_text, card.merit_checklist);
    const excellenceLines = pickLines(card.excellence_text, card.excellence_checklist);

    const { achievedField, meritField, excellenceField, setStatusFn } = fields || {};

    if (achievedField && achievedLines.length) {
        achievedField.value = achievedLines.join("\n");
    }
    if (meritField && meritLines.length) {
        meritField.value = meritLines.join("\n");
    }
    if (excellenceField && excellenceLines.length) {
        excellenceField.value = excellenceLines.join("\n");
    }

    if (typeof setStatusFn === "function") {
        const templateLabel = String(card?.course_name || "").trim();
        setStatusFn(`Standard added. Loaded criteria from Assessment Standard Card${templateLabel ? ` (${templateLabel})` : ""}`);
    }
}

function formatDetailStandardOption(row) {
    const standardNumber = String(row?.standard_number || "").trim();
    const standardName = String(row?.standard_name || "").trim();
    const level = Number.parseInt(row?.level, 10);
    const credits = Number.isFinite(Number(row?.credits)) ? Number(row.credits) : null;
    return [
        standardNumber || "Unknown",
        standardName || "Unnamed standard",
        Number.isInteger(level) ? `L${level}` : "",
        Number.isFinite(credits) ? `${credits} credits` : ""
    ].filter(Boolean).join(" | ");
}

async function getDetailStandardsOptions() {
    if (Array.isArray(detailStandardsOptionsCache)) {
        return detailStandardsOptionsCache;
    }

    try {
        const response = await fetch("/api/assessment-standards/options?stream=both&level=all", {
            headers: buildWriteHeaders()
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            return [];
        }

        detailStandardsOptionsCache = Array.isArray(payload?.options) ? payload.options : [];
        return detailStandardsOptionsCache;
    } catch (_error) {
        return [];
    }
}

async function setupDetailStandardsPicker(form, setStatus) {
    const textarea = form?.querySelector('textarea[name="standardDetails"]');
    const picker = form?.querySelector('select[name="standardLibraryOption"]');
    const addButton = form?.querySelector('[data-add-standard-line]');
    const chipList = form?.querySelector('[data-standard-chip-list]');
    if (!textarea || !picker || !addButton) {
        return;
    }

    const renderChips = () => {
        if (!chipList) {
            return;
        }

        const lines = parseLines(textarea.value);
        if (!lines.length) {
            chipList.innerHTML = `<span class="empty-note">No standards selected yet.</span>`;
            return;
        }

        chipList.innerHTML = lines.map((line) => {
            const escaped = escapeHtml(line);
            return `<span class="standard-chip"><span>${escaped}</span><button type="button" class="standard-chip-remove" data-standard-remove="${escaped}">Remove</button></span>`;
        }).join("");
    };

    renderChips();

    picker.innerHTML = `<option value="">Loading standards...</option>`;
    picker.disabled = true;
    addButton.disabled = true;

    const options = await getDetailStandardsOptions();
    if (!options.length) {
        picker.innerHTML = `<option value="">No standards available</option>`;
        picker.disabled = false;
        addButton.disabled = false;
        renderChips();
        return;
    }

    picker.innerHTML = [
        `<option value="">Select a standard...</option>`,
        ...options.map((row) => {
            const text = formatDetailStandardOption(row);
            const escapedText = escapeHtml(text);
            return `<option value="${escapedText}">${escapedText}</option>`;
        })
    ].join("");
    picker.disabled = false;
    addButton.disabled = false;
    renderChips();

    addButton.addEventListener("click", () => {
        const selected = String(picker.value || "").trim();
        if (!selected) {
            setStatus("Select a standard first.", true);
            return;
        }

        const existing = parseLines(textarea.value);
        if (!existing.includes(selected)) {
            existing.push(selected);
            textarea.value = existing.join("\n");
            renderChips();
        }
        setStatus("Standard added.");

        const achievedField = form?.querySelector('[name="achieved"]');
        const meritField = form?.querySelector('[name="merit"]');
        const excellenceField = form?.querySelector('[name="excellence"]');
        void tryAutofillDetailStandardCard(selected, {
            onApplied: (card) => applyDetailStandardCardTemplate(card, {
                achievedField,
                meritField,
                excellenceField,
                setStatusFn: setStatus
            })
        });
    });

    if (chipList) {
        chipList.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-standard-remove]");
            if (!button) return;
            const value = String(button.getAttribute("data-standard-remove") || "").trim();
            if (!value) return;

            const next = parseLines(textarea.value).filter((line) => line !== value);
            textarea.value = next.join("\n");
            renderChips();
            setStatus("Standard removed.");
        });
    }
}

function hasDetailPageAccess() {
    const raw = localStorage.getItem(DETAIL_HUB_AUTH_STORAGE_KEY) || sessionStorage.getItem(DETAIL_HUB_AUTH_STORAGE_KEY);
    if (!raw) return false;

    try {
        const parsed = JSON.parse(raw);
        if (!(parsed?.idToken || parsed?.accessToken) || !parsed?.expiresAt || Number(parsed.expiresAt) <= Date.now()) {
            return false;
        }

        const email = String(parsed?.profile?.email || "").trim().toLowerCase();
        if (!email) return false;
        if (!detailAllowedDomain) return true;
        return email.endsWith(`@${detailAllowedDomain}`);
    } catch (_error) {
        return false;
    }
}

const DETAIL_HUB_VIEW_MODE_KEY = "hub_view_mode_v1";

function isTeacherWorkspacePathForDetail() {
    const path = String(window.location.pathname || "").toLowerCase();
    return path.endsWith("/teacher-view.html")
        || path.endsWith("/upload-activity.html")
        || path.endsWith("/upload-project.html")
        || path.endsWith("/upload-menu.html")
        || path.endsWith("/teacher-project-allocation.html")
        || path.endsWith("/teacher-assessment-allocation.html")
        || path.endsWith("/class-management.html");
}

function readStoredHubViewModeForDetail() {
    try {
        const value = localStorage.getItem(DETAIL_HUB_VIEW_MODE_KEY);
        return value === "teacher" || value === "student" ? value : "";
    } catch (_error) {
        return "";
    }
}

function resolveDetailTeacherMode(canEditRole) {
    if (!canEditRole) {
        return false;
    }

    if (isTeacherWorkspacePathForDetail()) {
        return true;
    }

    const mode = readStoredHubViewModeForDetail();
    if (mode === "student") {
        return false;
    }

    return true;
}

async function canEditDetails() {
    const email = readStoredHubEmail();
    if (!email) return false;

    try {
        const response = await fetch(`/api/auth/user-access?email=${encodeURIComponent(email)}`);
        if (!response.ok) return false;
        const access = await response.json();
        return Boolean(access?.can_teacher_view || access?.can_admin);
    } catch (_error) {
        return false;
    }
}

async function readSharedActivity(activityId) {
    if (!activityId) return null;

    let found;
    try {
        const response = await fetch(`/api/activities/${encodeURIComponent(activityId)}`);
        if (!response.ok) return null;
        found = await response.json();
    } catch (_error) {
        return null;
    }
    if (!found) return null;

    const toArray = (value) => {
        if (Array.isArray(value)) {
            return value.map((item) => String(item || "").trim()).filter(Boolean);
        }

        if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) {
                return [];
            }

            if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("\"") && trimmed.endsWith("\""))) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        return parsed.map((item) => String(item || "").trim()).filter(Boolean);
                    }
                } catch (_error) {
                    // Fall through to newline parsing.
                }
            }

            return trimmed
                .split(/\r?\n/)
                .map((item) => item.trim())
                .filter(Boolean);
        }

        return [];
    };

    const foundStandardDetails = toArray(found.standard_details);
    const foundTasksList = toArray(found.tasks_list);
    const foundAssessmentFocus = toArray(found.assessment_focus);
    const inferredAssessmentCategory = (
        foundStandardDetails.length
        || foundTasksList.length
        || foundAssessmentFocus.length
        || toArray(found.achieved).length
        || toArray(found.merit).length
        || toArray(found.excellence).length
    ) ? "Assessment Task" : "Activity";

    return {
        id: found.id || activityId,
        title: found.name || "Uploaded Activity",
        yearLevel: found.year_level || "Year level",
        type: found.type || "Digital Learning",
            duration: `${normalizeDurationMinutes(found)} mins`,
        term: found.term || "Term 2",
        activityCategory: normalizeCardCategory(found.activity_category || found.category, inferredAssessmentCategory),
            showInThisWeek: Boolean(found.show_in_this_week ?? found.show_this_week ?? found.is_pinned ?? found.is_this_week),
        summary: String(found.description || found.summary || "").trim(),
        resources: toArray(found.resources),
        equipment: toArray(found.equipment),
        instructions: toArray(found.instructions),
        cardUrl: String(found.card_url || found.activity_url || found.url || "").trim(),
        image: found.outcome_image_url || "https://placehold.co/900x560/3f89cf/ffffff?text=Uploaded+Activity",
        
        // Project Proposal Fields
        startDate: found.start_date || "",
        contactName: found.contact_name || "",
        contactPhone: found.contact_phone || "",
        contactEmail: found.contact_email || "",
        company: found.company || "",
        address: found.address || "",
        overview: toArray(found.overview),
        services: toArray(found.services),
        costs: toArray(found.costs),
        outcomes: toArray(found.outcomes),
        withdrawalDate: found.withdrawal_date || "",
        clientId: found.client_id || "",
        
        // Assessment Task Fields
        standardDetails: foundStandardDetails,
        tasksList: (() => {
            const fromTasksList = foundTasksList;
            if (fromTasksList.length) {
                return fromTasksList;
            }
            return foundAssessmentFocus;
        })(),
        assessmentFocus: foundAssessmentFocus,
        assessmentFocusRaw: found.assessment_focus,
        achieved: toArray(found.achieved),
        merit: toArray(found.merit),
        excellence: toArray(found.excellence),
        submissionRequirements: toArray(found.submission_requirements),
        relevantImplications: toArray(found.relevant_implications),
        progressLogging: toArray(found.progress_logging),
        feedbackTrialling: toArray(found.feedback_trialling)
    };
}

    function normalizeDurationMinutes(record) {
        const minutes = Number.parseInt(record?.duration_minutes, 10);
        if (Number.isFinite(minutes) && minutes > 0) {
            return minutes;
        }

        const rawHours = Number(record?.duration_hours);
        if (Number.isFinite(rawHours) && rawHours > 0) {
            // Backward compatibility: some rows were previously saved as minutes in duration_hours.
            if (rawHours > 12) {
                return Math.round(rawHours);
            }
            return Math.round(rawHours * 60);
        }

        const genericDuration = Number(record?.duration);
        if (Number.isFinite(genericDuration) && genericDuration > 0) {
            return Math.round(genericDuration);
        }

        return 120;
    }

function renderList(items) {
    return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function normalizeTaskTopicText(value) {
    return String(value || "")
        .replace(/^(Achieved|Merit|Excellence)\s*:\s*/i, "")
        .trim();
}

function inferDriveSyncType(taskTopicTitle = "", taskShortName = "") {
    const combinedText = `${taskTopicTitle || ""} ${taskShortName || ""}`
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const hasExplicitOneDrive = /(microsoft\s+onedrive|onedrive|one\s*drive|sharepoint)/i.test(combinedText);
    const hasExplicitGoogleDrive = /(google\s+drive|drive\.google\.com)/i.test(combinedText);

    if (hasExplicitOneDrive && !hasExplicitGoogleDrive) return "onedrive";
    if (hasExplicitGoogleDrive && !hasExplicitOneDrive) return "google-drive";
    if (hasExplicitOneDrive) return "onedrive";
    if (hasExplicitGoogleDrive) return "google-drive";
    return "unknown";
}

function deriveTaskShortName(value) {
    const raw = normalizeTaskTopicText(value);
    if (!raw) {
        return "";
    }

    const normalized = raw.toLowerCase();
    const phraseMap = [
        { pattern: /describe\s+the\s+digital\s+outcome|describe.*digital\s+outcome/, label: "Digital Outcome Description" },
        { pattern: /identify\s+the\s+target\s+audience|target\s+audience|end\s+user/, label: "Target Audience" },
        { pattern: /explain\s+how\s+the\s+outcome\s+will\s+be\s+developed|tools\/?technologies/, label: "Development Steps" },
        { pattern: /state\s+how\s+success\s+will\s+be\s+measured|success\s+will\s+be\s+evaluated/, label: "Success Criteria" },
        { pattern: /project\s+management/, label: "Project Management" },
        { pattern: /relevant\s+implications/, label: "Relevant Implications" },
        { pattern: /version\s+control/, label: "Version Control" },
        { pattern: /digital\s+technologies\s+outcome/, label: "Digital Outcome" },
        { pattern: /decompos/, label: "Decomposition" },
        { pattern: /triall?ing\s+multiple\s+components/, label: "Component Trialling" },
        { pattern: /triall?ing\s+the\s+components/, label: "Component Trialling" },
        { pattern: /testing\s+that/, label: "Functional Testing" },
        { pattern: /using\s+information\s+appropriately/, label: "Testing Insights" },
        { pattern: /discussing\s+how/, label: "Planning Insights" }
    ];

    for (const entry of phraseMap) {
        if (entry.pattern.test(normalized)) {
            return entry.label;
        }
    }

    const stopwords = new Set([
        "the", "and", "for", "with", "from", "that", "this", "into", "using", "use", "how",
        "which", "are", "was", "were", "have", "has", "had", "its", "their", "these", "those",
        "plan", "development", "digital", "technologies", "outcome", "components"
    ]);

    const keywords = normalized
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 2 && !stopwords.has(word));

    if (!keywords.length) {
        return raw;
    }

    return keywords
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function isDigitalOutcomeDescriptionCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (!topicText && !shortNameText) {
        return false;
    }

    if (/description\s*-\s*google\s*slides/.test(topicText)) {
        return true;
    }
    if (/describe.*digital\s+outcome/.test(topicText)) {
        return true;
    }
    return shortNameText === DIGITAL_OUTCOME_DESCRIPTION_TITLE.toLowerCase();
}

function isDigitalOutcomeTargetAudienceCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (!topicText && !shortNameText) {
        return false;
    }

    if (/identify\s+the\s+target\s+audience/.test(topicText)) {
        return true;
    }
    if (/end\s+user\s+for\s+this\s+outcome/.test(topicText)) {
        return true;
    }
    return shortNameText === DIGITAL_OUTCOME_TARGET_AUDIENCE_TITLE.toLowerCase();
}

function isDigitalOutcomeDevelopmentToolsCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (!topicText && !shortNameText) {
        return false;
    }

    if (/explain\s+how\s+the\s+outcome\s+will\s+be\s+developed/.test(topicText)) {
        return true;
    }
    if (/tools\/?technologies\s+will\s+be\s+used/.test(topicText)) {
        return true;
    }
    return shortNameText === DIGITAL_OUTCOME_DEVELOPMENT_TOOLS_TITLE.toLowerCase();
}

function isDigitalOutcomeTriallingComponentsCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/trial\s+(?:the\s+)?components|triall?ing\s+(?:the\s+)?components|trailing\s+components/.test(topicText)) return true;
    return shortNameText === DIGITAL_OUTCOME_TRIALLING_COMPONENTS_TITLE.toLowerCase();
}

function isDigitalOutcomeTestingFunctionsCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/testing\s+functions|test(?:ing)?\s+that\s+the\s+digital\s+technologies\s+outcome\s+functions/.test(topicText)) return true;
    return shortNameText === DIGITAL_OUTCOME_TESTING_FUNCTIONS_TITLE.toLowerCase();
}

function isDigitalOutcomeRelevantDigiMedConventionsCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/relevant\s+(?:digimed\s+)?conventions|relevant\s+conventions\s+for\s+the\s+media\s+type/.test(topicText)) return true;
    return shortNameText === DIGITAL_OUTCOME_RELEVANT_DIGIMED_CONVENTIONS_TITLE.toLowerCase();
}

function isDigitalOutcomeUXPrinciplesCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/user\s+experience\s+principles|ux\s+principles/.test(topicText)) return true;
    return shortNameText === DIGITAL_OUTCOME_UX_PRINCIPLES_TITLE.toLowerCase();
}

function isDigitalOutcomeVideoIntegrityCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/video\s+integrity|video\s+testing|integrity\s*&?\s*validation\s*\(video\)/.test(topicText)) return true;
    return shortNameText === DIGITAL_OUTCOME_VIDEO_INTEGRITY_TITLE.toLowerCase();
}

function isDigitalOutcomeImageIntegrityCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/image\s+integrity|image\s+testing|integrity\s*&?\s*validation\s*\(image\)/.test(topicText)) return true;
    return shortNameText === DIGITAL_OUTCOME_IMAGE_INTEGRITY_TITLE.toLowerCase();
}

function isDigitalOutcomeVideoUXPrinciplesCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/video\s+ux\s+principles|ux\s+principles\s*\(video\)/.test(topicText)) return true;
    return shortNameText === DIGITAL_OUTCOME_VIDEO_UX_PRINCIPLES_TITLE.toLowerCase();
}

function isDigitalOutcomeVideoConventionsCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/video\s+conventions|conventions\s*\(video\)/.test(topicText)) return true;
    return shortNameText === DIGITAL_OUTCOME_VIDEO_CONVENTIONS_TITLE.toLowerCase();
}

function isUseOfToolsTechniquesCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    return /^using\s+tools\s*(?:&|and)\s*techniques(?:\s*\(.*\))?$/.test(topicText)
        || /^using\s+tools\s*(?:&|and)\s*techniques(?:\s*\(.*\))?$/.test(shortNameText);
}

function isToolsAndTechniquesCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/what\s+tools\s+and\s+techniques\s+will\s+be\s+used|identify\s+tools\s+and\s+techniques\s+for\s+this\s+outcome/.test(topicText)) return true;
    return shortNameText === DIGITAL_OUTCOME_TOOLS_TECHNIQUES_TITLE.toLowerCase()
        || shortNameText === "tools and techniques";
}

function isCodeValidationCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (/markup\s+validation|code\s+validation|html\/?css\s+validation|integrity\s*&?\s*validation\s*\(web\)/.test(topicText)) return true;
    if (/markup\s+validation|code\s+validation|integrity\s*&?\s*validation\s*\(web\)/.test(shortNameText)) return true;
    return shortNameText === DIGITAL_OUTCOME_CODE_VALIDATION_TITLE.toLowerCase();
}

function isDigitalOutcomeSuccessCriteriaCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (!topicText && !shortNameText) {
        return false;
    }

    if (/state\s+how\s+success\s+will\s+be\s+measured/.test(topicText)) {
        return true;
    }
    if (/success\s+will\s+be\s+evaluated/.test(topicText)) {
        return true;
    }
    return shortNameText === DIGITAL_OUTCOME_SUCCESS_CRITERIA_TITLE.toLowerCase();
}

function isDigitalOutcomeRelevantImplicationsCriterion(taskTopicTitle, taskShortName = "") {
    const topicText = String(taskTopicTitle || "").trim().toLowerCase();
    const shortNameText = String(taskShortName || "").trim().toLowerCase();
    if (!topicText && !shortNameText) {
        return false;
    }

    if (/relevant\s+implications/.test(topicText)) {
        return true;
    }
    return shortNameText === DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_TITLE.toLowerCase();
}

function inferDigitalOutcomeTopicKeyFromTitle(pageTitle) {
    const normalized = String(pageTitle || "").trim().toLowerCase();
    if (!normalized) {
        return "";
    }

    if (/target\s+audience|end\s+user/.test(normalized)) {
        return "target-audience";
    }

    if (/what\s+tools\s+and\s+techniques|identify\s+tools\s+and\s+techniques/.test(normalized)) {
        return "tools-and-techniques";
    }

    if (/trial\s+(?:the\s+)?components|triall?ing\s+(?:the\s+)?components|trailing\s+components/.test(normalized)) {
        return "trialling-components";
    }

    if (/testing\s+functions|test(?:ing)?\s+that\s+the\s+digital\s+technologies\s+outcome\s+functions/.test(normalized)) {
        return "testing-functions";
    }

    if (/relevant\s+(?:digimed\s+)?conventions|relevant\s+conventions\s+for\s+the\s+media\s+type/.test(normalized)) {
        return "relevant-digimed-conventions";
    }

    if (/video\s+integrity|video\s+testing|integrity\s*&?\s*validation\s*\(video\)/.test(normalized)) {
        return "video-integrity-testing";
    }

    if (/image\s+integrity|image\s+testing|integrity\s*&?\s*validation\s*\(image\)/.test(normalized)) {
        return "image-integrity-testing";
    }

    if (/video\s+ux\s+principles|ux\s+principles\s*\(video\)/.test(normalized)) {
        return "video-ux-principles";
    }

    if (/video\s+conventions|conventions\s*\(video\)/.test(normalized)) {
        return "video-conventions";
    }

    if (/user\s+experience\s+principles|ux\s+principles/.test(normalized)) {
        return "user-experience-principles";
    }

    if (/developed|development|tools\/?technologies|tools|technologies/.test(normalized)) {
        return "development-steps";
    }

    if (/relevant\s+implications/.test(normalized)) {
        return "relevant-implications";
    }

    if (/success\s+will\s+be\s+measured|success\s+will\s+be\s+evaluated|success\s+criteria|measured|evaluated/.test(normalized)) {
        return "success-criteria";
    }

    if (/description\s*-\s*google\s*slides|describe.*digital\s+outcome|digital\s+outcome\s+description/.test(normalized)) {
        return "description";
    }

    return "";
}

function getTaskTopicShortNameOverride(activityId, topicText) {
    if (typeof window === "undefined" || typeof window.hubGetTaskTopicShortNameOverride !== "function") {
        return "";
    }

    try {
        return String(window.hubGetTaskTopicShortNameOverride(activityId, topicText) || "").trim();
    } catch (_error) {
        return "";
    }
}

function normalizeTaskTopicStorageSlug(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);
}

function getTaskTopicSlideSyncStorageKey(projectId, email, taskTopic, taskShortName = "") {
    const safeProjectId = String(projectId || "").trim();
    const safeEmail = String(email || "").trim().toLowerCase();
    const topicSlug = normalizeTaskTopicStorageSlug(taskTopic);
    const shortSlug = normalizeTaskTopicStorageSlug(taskShortName);
    return `${TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${safeProjectId}:${safeEmail}:${topicSlug}:${shortSlug}`;
}

function readStoredTaskTopicSlideSyncLink(projectId, email, taskTopic, taskShortName = "") {
    const entry = readStoredTaskTopicSlideSyncEntry(projectId, email, taskTopic, taskShortName);
    return entry.url;
}

function readStoredTaskTopicSlideSyncEntry(projectId, email, taskTopic, taskShortName = "") {
    const key = getTaskTopicSlideSyncStorageKey(projectId, email, taskTopic, taskShortName);
    try {
        const raw = localStorage.getItem(key);
        if (!raw) {
            return { url: "", savedAt: "", templateId: "" };
        }
        const parsed = JSON.parse(raw);
        return {
            url: toSafeExternalUrl(parsed?.url || ""),
            savedAt: String(parsed?.savedAt || "").trim(),
            templateId: String(parsed?.templateId || "").trim(),
            thumbnailUrl: toSafeExternalUrl(parsed?.thumbnailUrl || ""),
            syncSource: String(parsed?.syncSource || "").trim().toLowerCase()
        };
    } catch (_error) {
        return { url: "", savedAt: "", templateId: "", thumbnailUrl: "", syncSource: "" };
    }
}

function isCompletionEligibleSyncEntry(entry, taskTopicText = "") {
    const safeUrl = toSafeExternalUrl(entry?.url || "");
    const syncSource = String(entry?.syncSource || "").trim().toLowerCase();
    if (!safeUrl) {
        return false;
    }

    if (syncSource === "template-use" || syncSource === "manual-link" || syncSource === "manual-submit") {
        return true;
    }

    if (syncSource === "folder-match") {
        const normalizedTopic = String(taskTopicText || "").trim().toLowerCase();
        if (normalizedTopic.includes("describe the digital outcome") || normalizedTopic.includes("description - google slides")) {
            return true;
        }
        if (normalizedTopic.includes("target audience") || normalizedTopic.includes("end user")) {
            return true;
        }
    }

    // Backward-compatibility: legacy sync entries created before syncSource existed.
    if (!syncSource) {
        const normalizedTopic = String(taskTopicText || "").trim().toLowerCase();
        if (normalizedTopic.includes("describe the digital outcome") || normalizedTopic.includes("description - google slides")) {
            return true;
        }
        if (normalizedTopic.includes("target audience") || normalizedTopic.includes("end user")) {
            return true;
        }
    }

    return false;
}

function readStoredTaskTopicSlideSyncEntryByShortName(projectId, email, taskShortName = "") {
    const safeProjectId = String(projectId || "").trim();
    const safeEmail = String(email || "").trim().toLowerCase();
    const shortSlug = normalizeTaskTopicStorageSlug(taskShortName);
    if (!safeProjectId || !safeEmail || !shortSlug) {
        return { url: "", savedAt: "", templateId: "", thumbnailUrl: "", syncSource: "" };
    }

    const keyPrefix = `${TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${safeProjectId}:${safeEmail}:`;
    let bestMatch = { url: "", savedAt: "", templateId: "", thumbnailUrl: "", syncSource: "" };
    let bestTime = 0;

    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = String(localStorage.key(index) || "");
            if (!key.startsWith(keyPrefix)) {
                continue;
            }
            if (!key.endsWith(`:${shortSlug}`)) {
                continue;
            }

            const raw = localStorage.getItem(key);
            if (!raw) {
                continue;
            }
            const parsed = JSON.parse(raw);
            const safeUrl = toSafeExternalUrl(parsed?.url || "");
            if (!safeUrl) {
                continue;
            }

            const savedAt = String(parsed?.savedAt || "").trim();
            const savedTs = Date.parse(savedAt);
            const ts = Number.isFinite(savedTs) ? savedTs : 0;
            if (ts >= bestTime) {
                bestTime = ts;
                bestMatch = {
                    url: safeUrl,
                    savedAt,
                    templateId: String(parsed?.templateId || "").trim(),
                    thumbnailUrl: toSafeExternalUrl(parsed?.thumbnailUrl || ""),
                    syncSource: String(parsed?.syncSource || "").trim().toLowerCase()
                };
            }
        }
    } catch (_error) {
        return { url: "", savedAt: "", templateId: "", thumbnailUrl: "", syncSource: "" };
    }

    return bestMatch;
}

function readStoredTaskTopicSlideSyncEntryByTemplateId(projectId, email, templateId = "") {
    const safeProjectId = String(projectId || "").trim();
    const safeEmail = String(email || "").trim().toLowerCase();
    const targetTemplateId = String(templateId || "").trim().toLowerCase();
    if (!safeProjectId || !safeEmail || !targetTemplateId) {
        return { url: "", savedAt: "", templateId: "", thumbnailUrl: "", syncSource: "" };
    }

    const keyPrefix = `${TASK_TOPIC_SLIDE_SYNC_STORAGE_PREFIX}:${safeProjectId}:${safeEmail}:`;
    let bestMatch = { url: "", savedAt: "", templateId: "", thumbnailUrl: "", syncSource: "" };
    let bestTime = 0;

    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = String(localStorage.key(index) || "");
            if (!key.startsWith(keyPrefix)) {
                continue;
            }

            const raw = localStorage.getItem(key);
            if (!raw) {
                continue;
            }

            const parsed = JSON.parse(raw);
            const parsedTemplateId = String(parsed?.templateId || "").trim().toLowerCase();
            const safeUrl = toSafeExternalUrl(parsed?.url || "");
            if (!safeUrl || parsedTemplateId !== targetTemplateId) {
                continue;
            }

            const savedAt = String(parsed?.savedAt || "").trim();
            const savedTs = Date.parse(savedAt);
            const ts = Number.isFinite(savedTs) ? savedTs : 0;
            if (ts >= bestTime) {
                bestTime = ts;
                bestMatch = {
                    url: safeUrl,
                    savedAt,
                    templateId: String(parsed?.templateId || "").trim(),
                    thumbnailUrl: toSafeExternalUrl(parsed?.thumbnailUrl || ""),
                    syncSource: String(parsed?.syncSource || "").trim().toLowerCase()
                };
            }
        }
    } catch (_error) {
        return { url: "", savedAt: "", templateId: "", thumbnailUrl: "", syncSource: "" };
    }

    return bestMatch;
}

function updateTaskTopicTemplateHeroPreview(host, slidesUrl, topicLabel = "", preferredThumbnailUrl = "") {
    const heroImage = host?.querySelector(".task-topic-template-hero img");
    if (!heroImage) {
        return;
    }

    const thumbnailUrl = toSafeExternalUrl(preferredThumbnailUrl) || toGoogleSlidesThumbnailUrl(slidesUrl);
    if (!thumbnailUrl) {
        return;
    }

    heroImage.onerror = () => {
        heroImage.onerror = null;
        heroImage.src = DIGITAL_OUTCOME_GENERIC_TEMPLATE_PREVIEW_URL;
    };
    heroImage.src = thumbnailUrl;
    if (topicLabel) {
        heroImage.alt = `${String(topicLabel).trim()} slideshow template preview`;
    }
}

function updateTaskTopicTemplateHeroPreviewNoTemplate(host, topicLabel = "") {
    const heroWrap = host?.querySelector(".task-topic-template-hero");
    if (!heroWrap) return;
    heroWrap.innerHTML = `<div class="task-topic-template-hero-no-template">
        <p class="task-topic-template-hero-no-template-text">No template available yet for <strong>${escapeHtml(topicLabel)}</strong>.</p>
        <p class="task-topic-template-hero-no-template-sub">When a template is added to the library it will appear here automatically.</p>
    </div>`;
}

function writeStoredTaskTopicSlideSyncLink(projectId, email, taskTopic, taskShortName = "", value = "", options = {}) {
    const key = getTaskTopicSlideSyncStorageKey(projectId, email, taskTopic, taskShortName);
    const safeUrl = toSafeExternalUrl(value);
    try {
        if (!safeUrl) {
            localStorage.removeItem(key);
            return "";
        }
        const existingRaw = localStorage.getItem(key);
        const existing = existingRaw ? JSON.parse(existingRaw) : {};
        const nextTemplateId = String(options?.templateId || existing?.templateId || "").trim();
        const nextThumbnailUrl = toSafeExternalUrl(options?.thumbnailUrl || existing?.thumbnailUrl || "");
        const nextSyncSource = String(options?.syncSource || existing?.syncSource || "").trim().toLowerCase();
        localStorage.setItem(key, JSON.stringify({
            url: safeUrl,
            savedAt: new Date().toISOString(),
            templateId: nextTemplateId,
            thumbnailUrl: nextThumbnailUrl,
            syncSource: nextSyncSource
        }));
        return safeUrl;
    } catch (_error) {
        return "";
    }
}

function setTaskTopicShortNameOverride(activityId, topicText, shortName) {
    if (typeof window === "undefined" || typeof window.hubSetTaskTopicShortNameOverride !== "function") {
        return;
    }

    try {
        window.hubSetTaskTopicShortNameOverride(activityId, topicText, shortName);
    } catch (_error) {
        // Ignore storage helper failures.
    }
}

function collectDetailTaskTopics(data) {
    return [
        ...coerceArray(data?.tasksList),
        ...coerceArray(data?.assessmentFocus ?? data?.assessment_focus ?? data?.assessmentFocusRaw),
        ...coerceArray(data?.achieved),
        ...coerceArray(data?.merit),
        ...coerceArray(data?.excellence)
    ]
        .map((item) => normalizeTaskTopicText(item))
        .filter(Boolean);
}

function collectDetailTaskTopicEntries(data) {
    const output = [];

    const pushEntries = (items, level) => {
        coerceArray(items).forEach((item) => {
            const text = normalizeTaskTopicText(item);
            if (!text) {
                return;
            }

            output.push({ text, level });
        });
    };

    pushEntries(data?.tasksList, "General");
    pushEntries(data?.assessmentFocus ?? data?.assessment_focus ?? data?.assessmentFocusRaw, "General");
    pushEntries(data?.achieved, "Achieved");
    pushEntries(data?.merit, "Merit");
    pushEntries(data?.excellence, "Excellence");

    return output;
}

function extractPrimaryStandardNumberFromRows(rows) {
    const standardRows = Array.isArray(rows) ? rows : [];
    for (const row of standardRows) {
        const match = String(row || "").match(/\b\d{4,6}\b/);
        if (match && match[0]) {
            return match[0];
        }
    }
    return "";
}

function buildTaskTopicDetailHref(activityId, topicText, taskShortName = "", topicIndex = 0) {
    const params = new URLSearchParams();
    params.set("id", String(activityId || ""));
    params.set("taskTopic", String(topicText || "").trim());

    const resolvedShortName = String(taskShortName || "").trim() || deriveTaskShortName(topicText);
    if (resolvedShortName) {
        params.set("taskShortName", resolvedShortName);
    }

    if (Number.isFinite(Number(topicIndex)) && Number(topicIndex) > 0) {
        params.set("taskTopicIndex", String(topicIndex));
    }

    return `custom-activity.html?${params.toString()}`;
}

function collectMergedTaskTopicLinks(data, activityId, selectedTopic, selectedShortName) {
    const activeTopic = normalizeTaskTopicText(selectedTopic);
    const activeShortName = String(selectedShortName || "").trim() || deriveTaskShortName(activeTopic);
    if (!activeTopic || !activeShortName) {
        return [];
    }

    const allTopics = collectDetailTaskTopics(data);
    const topicEntries = collectDetailTaskTopicEntries(data);
    if (!topicEntries.length) {
        return [];
    }

    const levelRank = {
        Achieved: 1,
        Merit: 2,
        Excellence: 3,
        General: 4
    };

    const byTopic = new Map();
    topicEntries.forEach((entry) => {
        const topicText = String(entry.text || "").trim();
        if (!topicText) {
            return;
        }

        const resolvedShort = getTaskTopicShortNameOverride(activityId, topicText) || deriveTaskShortName(topicText);
        if (resolvedShort !== activeShortName) {
            return;
        }

        const key = topicText.toLowerCase();
        const existing = byTopic.get(key) || {
            topicText,
            levels: new Set(),
            shortName: resolvedShort
        };

        existing.levels.add(String(entry.level || "General"));
        byTopic.set(key, existing);
    });

    const links = Array.from(byTopic.values()).map((entry) => {
        const topicTextLower = entry.topicText.toLowerCase();
        const topicIndex = allTopics.findIndex((topic) => String(topic || "").trim().toLowerCase() === topicTextLower) + 1;
        const levels = Array.from(entry.levels);
        const primaryLevel = levels
            .slice()
            .sort((a, b) => (levelRank[a] || 99) - (levelRank[b] || 99))[0] || "General";

        return {
            topicText: entry.topicText,
            shortName: entry.shortName,
            levelLabel: levels.join(" / "),
            primaryLevel,
            isCurrent: topicTextLower === activeTopic.toLowerCase(),
            href: buildTaskTopicDetailHref(activityId, entry.topicText, entry.shortName, topicIndex)
        };
    });

    return links.sort((a, b) => {
        const levelDiff = (levelRank[a.primaryLevel] || 99) - (levelRank[b.primaryLevel] || 99);
        if (levelDiff !== 0) {
            return levelDiff;
        }
        return a.topicText.localeCompare(b.topicText);
    });
}

function resolveRequestedTaskTopic(data, params) {
    const requestedTopicText = String(params.get("taskTopic") || "").trim();
    const requestedTopicIndex = Number.parseInt(params.get("taskTopicIndex"), 10);
    const allTopics = collectDetailTaskTopics(data);
    const normalizedRequested = normalizeTaskTopicText(requestedTopicText);

    if (!allTopics.length) {
        return normalizedRequested;
    }

    if (requestedTopicText) {
        const normalizedRequestedLower = normalizedRequested.toLowerCase();
        const exactMatch = allTopics.find((topic) => topic.toLowerCase() === normalizedRequestedLower);
        if (exactMatch) {
            return exactMatch;
        }

        // Preserve clicked topic context even when backend topic parsing does not align.
        if (normalizedRequested) {
            return normalizedRequested;
        }
    }

    if (Number.isFinite(requestedTopicIndex) && requestedTopicIndex > 0) {
        return allTopics[requestedTopicIndex - 1] || "";
    }

    return "";
}

function defaultDetailShape(id, data) {
    const inferredAssessmentCategory = (
        coerceArray(data?.standardDetails).length
        || coerceArray(data?.tasksList).length
        || coerceArray(data?.assessmentFocus ?? data?.assessment_focus).length
        || coerceArray(data?.achieved).length
        || coerceArray(data?.merit).length
        || coerceArray(data?.excellence).length
    ) ? "Assessment Task" : "Activity";

    return {
        id,
        title: String(data?.title || "").trim() || "Activity",
        yearLevel: String(data?.yearLevel || "").trim() || "Year level",
        type: String(data?.type || "").trim() || "Digital Learning",
        duration: String(data?.duration || "120 mins").trim() || "120 mins",
        term: String(data?.term || "Term 2").trim() || "Term 2",
        subjectStream: String(data?.subjectStream || data?.subject_stream || data?.subject || "").trim().toUpperCase(),
        activityCategory: normalizeCardCategory(data?.activityCategory || data?.activity_category || data?.category, inferredAssessmentCategory),
        cardColor: String(data?.cardColor || data?.card_color || data?.color || "").trim() || getDefaultCardColorForCategory(data?.activityCategory || data?.activity_category || data?.category || inferredAssessmentCategory),
        showInThisWeek: Boolean(data?.showInThisWeek),
        summary: String(data?.summary || "").trim(),
        resources: Array.isArray(data?.resources) ? data.resources : [],
        equipment: Array.isArray(data?.equipment) ? data.equipment : [],
        instructions: Array.isArray(data?.instructions) ? data.instructions : [],
        cardUrl: String(data?.cardUrl || data?.card_url || data?.activity_url || data?.url || "").trim(),
        image: String(data?.image || "").trim() || "https://placehold.co/900x560/3f89cf/ffffff?text=Uploaded+Activity",
        slideshowTemplateImage: toSafeExternalUrl(data?.slideshowTemplateImage || data?.slideTemplateImage || ""),
        slideshowTemplateFileUrl: toSafeExternalUrl(data?.slideshowTemplateFileUrl || data?.slideTemplateFileUrl || data?.speakerNotesCriteriaUrl || ""),
        
        // Project Proposal Fields
        startDate: String(data?.startDate || "").trim(),
        contactName: String(data?.contactName || "").trim(),
        contactPhone: String(data?.contactPhone || "").trim(),
        contactEmail: String(data?.contactEmail || "").trim(),
        company: String(data?.company || "").trim(),
        address: String(data?.address || "").trim(),
        overview: Array.isArray(data?.overview) ? data.overview : [],
        services: Array.isArray(data?.services) ? data.services : [],
        costs: Array.isArray(data?.costs) ? data.costs : [],
        outcomes: Array.isArray(data?.outcomes) ? data.outcomes : [],
        withdrawalDate: String(data?.withdrawalDate || "").trim(),
        clientId: String(data?.clientId || "").trim(),
        
        // Assessment Task Fields
        standardDetails: Array.isArray(data?.standardDetails) ? data.standardDetails : [],
        tasksList: (() => {
            const fromTasksList = coerceArray(data?.tasksList);
            if (fromTasksList.length) {
                return fromTasksList;
            }

            const fromAssessmentFocus = coerceArray(data?.assessmentFocus ?? data?.assessment_focus ?? data?.assessmentFocusRaw);
            if (fromAssessmentFocus.length) {
                return fromAssessmentFocus;
            }

            return [];
        })(),
        achieved: Array.isArray(data?.achieved) ? data.achieved : [],
        merit: Array.isArray(data?.merit) ? data.merit : [],
        excellence: Array.isArray(data?.excellence) ? data.excellence : [],
        submissionRequirements: Array.isArray(data?.submissionRequirements) ? data.submissionRequirements : [],
        relevantImplications: Array.isArray(data?.relevantImplications) ? data.relevantImplications : [],
        progressLogging: Array.isArray(data?.progressLogging) ? data.progressLogging : [],
        feedbackTrialling: Array.isArray(data?.feedbackTrialling) ? data.feedbackTrialling : []
    };
}

function renderDetailView(host, id, data, canEdit, selectedTaskTopic = "", selectedTaskShortName = "") {
    const normalizedCategory = normalizeCardCategory(data?.activityCategory, "Activity");
    const isAssessmentTask = normalizedCategory === "Assessment Task";
    const canConvertCategory = canEdit && !selectedTaskTopic && Boolean(String(id || "").match(/^\d+$/));
    const cardUrl = toSafeExternalUrl(data?.cardUrl);
    const taskTopicTitle = String(selectedTaskTopic || "").trim();
    const isTaskTopicView = Boolean(taskTopicTitle);
    const isStudentTaskTopicView = isTaskTopicView && !canEdit;
    const toolbarLabel = isTaskTopicView
        ? "Task Topic Card"
        : (isAssessmentTask ? "Assessment Task Details" : (normalizedCategory === "Project" ? "Project" : "Activity"));
    const standardTaskTopicUrl = cardUrl || `${window.location.origin}/ProjectPages/custom-activity.html?id=${encodeURIComponent(String(id || ""))}`;
    const parentAssessmentUrl = `custom-activity.html?id=${encodeURIComponent(String(id || ""))}`;
    const resolvedTaskShortName = String(selectedTaskShortName || "").trim()
        || (taskTopicTitle ? getTaskTopicShortNameOverride(id, taskTopicTitle) : "")
        || (taskTopicTitle ? deriveTaskShortName(taskTopicTitle) : "");
    const keywordMatchedTopicKey = inferDigitalOutcomeTopicKeyFromTitle(`${taskTopicTitle} ${resolvedTaskShortName}`);
    const isDigitalOutcomeDescriptionTopic = isDigitalOutcomeDescriptionCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "description";
    const isDigitalOutcomeTargetAudienceTopic = isDigitalOutcomeTargetAudienceCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "target-audience";
    const isDigitalOutcomeDevelopmentToolsTopic = isDigitalOutcomeDevelopmentToolsCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "development-steps";
    const isDigitalOutcomeTriallingComponentsTopic = isDigitalOutcomeTriallingComponentsCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "trialling-components";
    const isDigitalOutcomeTestingFunctionsTopic = isDigitalOutcomeTestingFunctionsCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "testing-functions";
    const isDigitalOutcomeRelevantDigiMedConventionsTopic = isDigitalOutcomeRelevantDigiMedConventionsCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "relevant-digimed-conventions";
    const isDigitalOutcomeUXPrinciplesTopic = isDigitalOutcomeUXPrinciplesCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "user-experience-principles";
    const isDigitalOutcomeVideoIntegrityTopic = isDigitalOutcomeVideoIntegrityCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "video-integrity-testing";
    const isDigitalOutcomeImageIntegrityTopic = isDigitalOutcomeImageIntegrityCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "image-integrity-testing";
    const isDigitalOutcomeVideoUXPrinciplesTopic = isDigitalOutcomeVideoUXPrinciplesCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "video-ux-principles";
    const isDigitalOutcomeVideoConventionsTopic = isDigitalOutcomeVideoConventionsCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "video-conventions";
    const isToolsAndTechniquesTopic = isToolsAndTechniquesCriterion(taskTopicTitle, resolvedTaskShortName);
    const isUseOfToolsTechniquesTopic = isUseOfToolsTechniquesCriterion(taskTopicTitle, resolvedTaskShortName);
    const isCodeValidationTopic = isCodeValidationCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "code-validation";
    const isDigitalOutcomeSuccessCriteriaTopic = isDigitalOutcomeSuccessCriteriaCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "success-criteria";
    const isDigitalOutcomeRelevantImplicationsTopic = isDigitalOutcomeRelevantImplicationsCriterion(taskTopicTitle, resolvedTaskShortName)
        || keywordMatchedTopicKey === "relevant-implications";
    const digitalOutcomeTopicKey = isUseOfToolsTechniquesTopic
        ? "use-of-tools-and-techniques"
        : isDigitalOutcomeTargetAudienceTopic
        ? "target-audience"
        : isDigitalOutcomeTriallingComponentsTopic
            ? "trialling-components"
            : isToolsAndTechniquesTopic
                ? "tools-and-techniques"
                : isCodeValidationTopic
                    ? "code-validation"
                    : isDigitalOutcomeDevelopmentToolsTopic
                        ? "development-steps"
                        : isDigitalOutcomeSuccessCriteriaTopic
                            ? "success-criteria"
                            : isDigitalOutcomeRelevantImplicationsTopic
                                ? "relevant-implications"
                                : isDigitalOutcomeTestingFunctionsTopic
                                    ? "testing-functions"
                                    : isDigitalOutcomeRelevantDigiMedConventionsTopic
                                        ? "relevant-digimed-conventions"
                                        : isDigitalOutcomeUXPrinciplesTopic
                                            ? "user-experience-principles"
                                            : isDigitalOutcomeVideoIntegrityTopic
                                                ? "video-integrity-testing"
                                                : isDigitalOutcomeImageIntegrityTopic
                                                    ? "image-integrity-testing"
                                                : isDigitalOutcomeVideoUXPrinciplesTopic
                                                    ? "video-ux-principles"
                                                    : isDigitalOutcomeVideoConventionsTopic
                                                        ? "video-conventions"
                                            : isDigitalOutcomeDescriptionTopic
                                            ? "description"
                                            : keywordMatchedTopicKey;
    const mergedTaskTopicLinks = isTaskTopicView
        ? collectMergedTaskTopicLinks(data, id, taskTopicTitle, resolvedTaskShortName)
        : [];
    const showMergedTaskTopicLayout = mergedTaskTopicLinks.length > 1;
    const digitalOutcomeTopicTitles = {
        description: DIGITAL_OUTCOME_DESCRIPTION_TITLE,
        "target-audience": DIGITAL_OUTCOME_TARGET_AUDIENCE_TITLE,
        "trialling-components": DIGITAL_OUTCOME_TRIALLING_COMPONENTS_TITLE,
        "testing-functions": DIGITAL_OUTCOME_TESTING_FUNCTIONS_TITLE,
        "relevant-digimed-conventions": DIGITAL_OUTCOME_RELEVANT_DIGIMED_CONVENTIONS_TITLE,
        "user-experience-principles": DIGITAL_OUTCOME_UX_PRINCIPLES_TITLE,
        "video-integrity-testing": DIGITAL_OUTCOME_VIDEO_INTEGRITY_TITLE,
        "image-integrity-testing": DIGITAL_OUTCOME_IMAGE_INTEGRITY_TITLE,
        "video-ux-principles": DIGITAL_OUTCOME_VIDEO_UX_PRINCIPLES_TITLE,
        "video-conventions": DIGITAL_OUTCOME_VIDEO_CONVENTIONS_TITLE,
        "tools-and-techniques": DIGITAL_OUTCOME_TOOLS_TECHNIQUES_TITLE,
        "use-of-tools-and-techniques": String(taskTopicTitle || "").trim() || USE_OF_TOOLS_TECHNIQUES_TITLE,
        "code-validation": DIGITAL_OUTCOME_CODE_VALIDATION_TITLE,
        "development-steps": DIGITAL_OUTCOME_DEVELOPMENT_TOOLS_TITLE,
        "success-criteria": DIGITAL_OUTCOME_SUCCESS_CRITERIA_TITLE,
        "relevant-implications": DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_TITLE
    };
    const displayTitle = digitalOutcomeTopicTitles[digitalOutcomeTopicKey]
        || resolvedTaskShortName
        || taskTopicTitle
        || data.title;
    const displaySummaryHtml = taskTopicTitle
        ? `Task topic from <a class="task-topic-parent-link" href="${parentAssessmentUrl}">${escapeHtml(data.title)}</a>`
        : escapeHtml(data.summary);
    const taskTopicStandardDetails = coerceArray(data?.standardDetails)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
    const mergedStandardNumber = extractPrimaryStandardNumberFromRows(taskTopicStandardDetails);
    const resolvedTasksList = (() => {
        const fromTasksList = coerceArray(data?.tasksList);
        if (fromTasksList.length) {
            return fromTasksList;
        }
        return coerceArray(data?.assessmentFocus ?? data?.assessment_focus ?? data?.assessmentFocusRaw);
    })();
    const submissionRequirements = coerceArray(data?.submissionRequirements)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
    const relevantImplicationNotes = coerceArray(data?.relevantImplications)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
    const isRelevantImplicationsTopic = taskTopicTitle.toLowerCase().includes("relevant implication");
    const isProjectManagementTopic = taskTopicTitle.toLowerCase().includes("project management")
        || resolvedTaskShortName.toLowerCase().includes("project management");
    const resolvedDriveSyncType = inferDriveSyncType(taskTopicTitle, resolvedTaskShortName);
    const isOneDriveTopic = resolvedDriveSyncType === "onedrive";
    const isGoogleDriveTopic = resolvedDriveSyncType === "google-drive";
    const isGithubTopic = /(?:^|\s)github(?:\s|$)|github\.com|git\s*hub/i.test(`${taskTopicTitle} ${resolvedTaskShortName}`);
    const isDecompositionTopic = taskTopicTitle.toLowerCase().includes("decompos")
        || resolvedTaskShortName.toLowerCase().includes("decompos");
    const useProjectManagementTemplateHero = isProjectManagementTopic;
    const useDigitalOutcomeTemplateHero = Boolean(digitalOutcomeTopicKey) || useProjectManagementTemplateHero;
    const isDigitalOutcomeTopic = taskTopicTitle.toLowerCase().includes("digital outcome")
        || resolvedTaskShortName.toLowerCase().includes("digital outcome")
        || isDigitalOutcomeTargetAudienceTopic
        || isDigitalOutcomeDevelopmentToolsTopic
        || isDigitalOutcomeTriallingComponentsTopic
        || isDigitalOutcomeRelevantDigiMedConventionsTopic
        || isDigitalOutcomeUXPrinciplesTopic
        || isDigitalOutcomeVideoIntegrityTopic
        || isDigitalOutcomeImageIntegrityTopic
        || isDigitalOutcomeVideoUXPrinciplesTopic
        || isDigitalOutcomeVideoConventionsTopic
        || isToolsAndTechniquesTopic
        || isUseOfToolsTechniquesTopic
        || isCodeValidationTopic
        || isDigitalOutcomeSuccessCriteriaTopic
        || isDigitalOutcomeRelevantImplicationsTopic;
    const templateLibraryParams = new URLSearchParams();
    templateLibraryParams.set("activityId", String(id || "").trim());
    if (taskTopicTitle) {
        templateLibraryParams.set("taskTopic", taskTopicTitle);
    }
    if (resolvedTaskShortName) {
        templateLibraryParams.set("taskShortName", resolvedTaskShortName);
    }
    const preferredTemplateIds = {
        "target-audience": "target-audience",
        "trialling-components": "trialling-components",
        "testing-functions": "testing-functions",
        "relevant-digimed-conventions": "relevant-digimed-conventions",
        "user-experience-principles": "user-experience-principles",
        "video-integrity-testing": "video-integrity-testing",
        "image-integrity-testing": "image-integrity-testing",
        "video-ux-principles": "video-ux-principles",
        "video-conventions": "video-conventions",
        "tools-and-techniques": "tools-and-techniques",
        "use-of-tools-and-techniques": "use-of-tools-and-techniques",
        "code-validation": "testing-functions-markup-validation",
        "development-steps": "development-steps",
        "success-criteria": "project-success-criteria",
        "relevant-implications": "relevant-implications",
        description: "digital-outcome-description"
    };
    const preferredTemplateId = useProjectManagementTemplateHero
        ? "project-management"
        : (preferredTemplateIds[digitalOutcomeTopicKey] || "digital-outcome-description");
    if (useDigitalOutcomeTemplateHero) {
        templateLibraryParams.set("templateId", preferredTemplateId);
        // Add pre-filter topic name for template library search
        const topicDisplayNames = {
            "target-audience": DIGITAL_OUTCOME_TARGET_AUDIENCE_TITLE,
            "trialling-components": DIGITAL_OUTCOME_TRIALLING_COMPONENTS_TITLE,
            "testing-functions": DIGITAL_OUTCOME_TESTING_FUNCTIONS_TITLE,
            "relevant-digimed-conventions": DIGITAL_OUTCOME_RELEVANT_DIGIMED_CONVENTIONS_TITLE,
            "user-experience-principles": DIGITAL_OUTCOME_UX_PRINCIPLES_TITLE,
            "tools-and-techniques": DIGITAL_OUTCOME_TOOLS_TECHNIQUES_TITLE,
            "use-of-tools-and-techniques": USE_OF_TOOLS_TECHNIQUES_TEMPLATE_TITLE,
            "code-validation": DIGITAL_OUTCOME_CODE_VALIDATION_TEMPLATE_SEARCH_TITLE,
            "testing-functions-markup-validation": DIGITAL_OUTCOME_CODE_VALIDATION_TEMPLATE_SEARCH_TITLE,
            "development-steps": DIGITAL_OUTCOME_DEVELOPMENT_TOOLS_TITLE,
            "project-success-criteria": DIGITAL_OUTCOME_SUCCESS_CRITERIA_TITLE,
            "relevant-implications": DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_TITLE,
            "project-management": "Project Management",
            "digital-outcome-description": DIGITAL_OUTCOME_DESCRIPTION_TITLE
        };
        const topicDisplayName = topicDisplayNames[preferredTemplateId] || DIGITAL_OUTCOME_DESCRIPTION_TITLE;
        templateLibraryParams.set("preFilterTopic", topicDisplayName);
    }
    const slideshowTemplateLibraryUrl = `slideshow-template-library.html?${templateLibraryParams.toString()}`;
    const viewerEmail = readStoredHubEmail();
    const syncedTaskTopicEntryCandidates = [
        readStoredTaskTopicSlideSyncEntry(id, viewerEmail, taskTopicTitle, resolvedTaskShortName),
        readStoredTaskTopicSlideSyncEntryByShortName(id, viewerEmail, resolvedTaskShortName),
        readStoredTaskTopicSlideSyncEntryByShortName(id, viewerEmail, displayTitle),
        readStoredTaskTopicSlideSyncEntry(id, viewerEmail, taskTopicTitle, displayTitle),
        readStoredTaskTopicSlideSyncEntryByTemplateId(id, viewerEmail, preferredTemplateId)
    ].filter((entry) => {
        if (!toSafeExternalUrl(entry?.url || "")) return false;
        // Discard entries whose templateId belongs to a different topic to prevent cross-topic bleed
        const entryTemplateId = String(entry?.templateId || "").trim().toLowerCase();
        if (!entryTemplateId || !preferredTemplateId) return true;
        return entryTemplateId === preferredTemplateId
            || ((preferredTemplateId === "tools-and-techniques"
                || preferredTemplateId === "testing-functions"
                || preferredTemplateId === "relevant-implications")
                && entryTemplateId.startsWith(`${preferredTemplateId}-`));
    });
    const syncedTaskTopicEntry = syncedTaskTopicEntryCandidates.find((entry) => toSafeExternalUrl(entry?.url || ""));
    const taskTopicSyncedSlideThumbnail = toSafeExternalUrl(syncedTaskTopicEntry?.thumbnailUrl || "")
        || toGoogleSlidesThumbnailUrl(syncedTaskTopicEntry?.url || "");
    const digitalOutcomeTemplateFallbackImage = digitalOutcomeTopicKey === "target-audience"
        ? DIGITAL_OUTCOME_TARGET_AUDIENCE_TEMPLATE_PREVIEW_URL
        : (digitalOutcomeTopicKey === "tools-and-techniques"
            ? DIGITAL_OUTCOME_TOOLS_TECHNIQUES_TEMPLATE_PREVIEW_URL
        : (digitalOutcomeTopicKey === "relevant-implications"
            ? DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_TEMPLATE_PREVIEW_URL
        : (digitalOutcomeTopicKey === "description"
            ? DIGITAL_OUTCOME_DESCRIPTION_TEMPLATE_PREVIEW_URL
            : DIGITAL_OUTCOME_GENERIC_TEMPLATE_PREVIEW_URL)));
    const defaultDigitalOutcomeTemplateFileUrl = digitalOutcomeTopicKey === "relevant-implications"
        ? DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_FULL_SET_URL
        : "";
    const slideshowTemplateImage = (isDigitalOutcomeTopic || useDigitalOutcomeTemplateHero)
        ? (toSafeExternalUrl(data?.slideshowTemplateImage || data?.slideTemplateImage || "")
            || digitalOutcomeTemplateFallbackImage)
        : (toSafeExternalUrl(data?.slideshowTemplateImage || data?.slideTemplateImage || "")
            || taskTopicSyncedSlideThumbnail
            || (useDigitalOutcomeTemplateHero ? digitalOutcomeTemplateFallbackImage : ""));
    const slideshowTemplateFileUrl = toSafeExternalUrl(data?.slideshowTemplateFileUrl || data?.slideTemplateFileUrl || data?.speakerNotesCriteriaUrl || "")
        || defaultDigitalOutcomeTemplateFileUrl;
    const heroVisualImage = ((isDigitalOutcomeTopic || useDigitalOutcomeTemplateHero) ? (slideshowTemplateImage || data.image) : data.image)
        || "https://placehold.co/900x560/3f89cf/ffffff?text=Uploaded+Activity";
    const heroVisualAlt = (isDigitalOutcomeTopic || useDigitalOutcomeTemplateHero)
        ? `${displayTitle} slideshow template preview`
        : `${displayTitle} project image`;
    const heroImageHtml = (isDigitalOutcomeTopic || useDigitalOutcomeTemplateHero)
        ? `
                <div class="task-topic-template-hero">
                    <img src="${escapeHtml(heroVisualImage)}" alt="${escapeHtml(heroVisualAlt)}" loading="lazy">
                    <div class="task-topic-template-hero-actions">
                        <a class="detail-action detail-action-secondary" href="${escapeHtml(slideshowTemplateLibraryUrl)}">Open Template Library</a>
                    </div>
                </div>
            `
        : `<img src="${escapeHtml(heroVisualImage)}" alt="${escapeHtml(heroVisualAlt)}" loading="lazy">`;
    const subjectStream = String(data?.subjectStream || data?.subject_stream || data?.subject || "").trim().toUpperCase();
    const contextSignals = [
        subjectStream,
        String(data?.type || ""),
        String(data?.title || ""),
        taskTopicTitle,
        resolvedTaskShortName
    ].join(" ").toUpperCase();
    const isDigitalMediaContext = /(DIGITAL\s*MEDIA|MEDIA|FILM|VIDEO|AUDIO|MUSIC|PHOTOGRAPH|ANIMATION|GRAPHIC)/i.test(contextSignals);
    const isProgrammingContext = /(DTECH|PROGRAMM|CODING|COMPUT|SOFTWARE|WEB|APP|PYTHON|JAVASCRIPT|ROBOTIC)/i.test(contextSignals);
    const showGithubGuide = isProjectManagementTopic || isGithubTopic;
    const snowGithubGuide = showGithubGuide;
    const showOneDriveGuide = isOneDriveTopic;
    const showGoogleDriveGuide = isGoogleDriveTopic;
    const showCodeValidationGuide = isCodeValidationTopic;
    const submissionTaskItems = Array.from(new Set([
        ...(isDecompositionTopic
            ? [
                "Break the assessment into clear decomposition steps (one step per line in the planner).",
                "Save your decomposition plan in DTECH so your teacher can review your thinking.",
                "Select your Trello board and To Do list, then push the decomposition steps to Trello.",
                "Keep your Trello To Do list updated as steps are started, completed, or refined."
            ]
            : []),
        ...(isProjectManagementTopic
            ? [
                "Add your Trello card or board link so your teacher can verify project management evidence.",
                "Post a daily Trello work log update for progress tracking."
            ]
            : []),
        ...(isRelevantImplicationsTopic
            ? ["Written evidence that explains your relevant implications and justifies your design decisions."]
            : []),
        ...submissionRequirements
    ]));
    const submissionIntroText = isDecompositionTopic
        ? "Students plan decomposition here, then push those steps to Trello To Do for execution and tracking."
        : "Students submit evidence here to show they have completed this task topic.";
    const submissionPrimaryEvidenceType = isProjectManagementTopic
        ? "Trello Link + Work Log"
        : (isDecompositionTopic ? "Decomposition Plan + Trello To Do Cards"
        : (isRelevantImplicationsTopic ? "Written Evidence" : "Evidence Upload"));
    const topicGuideTitle = isProjectManagementTopic
        ? "Project Management: Trello"
        : (isDecompositionTopic ? "Decomposition + Trello"
        : (isDigitalOutcomeTopic
            ? (digitalOutcomeTopicKey === "target-audience"
                ? "Target Audience"
                : (digitalOutcomeTopicKey === "trialling-components"
                    ? "Trialling Components"
                    : (digitalOutcomeTopicKey === "development-steps"
                    ? "Development Steps"
                    : (digitalOutcomeTopicKey === "success-criteria"
                        ? "Success Criteria"
                        : (digitalOutcomeTopicKey === "relevant-digimed-conventions"
                            ? "Relevant DigiMed Conventions"
                        : (digitalOutcomeTopicKey === "user-experience-principles"
                            ? "User Experience (UX) Principles"
                        : (digitalOutcomeTopicKey === "relevant-implications"
                            ? "Relevant Implications"
                            : (digitalOutcomeTopicKey === "code-validation"
                                ? "Code Validation"
                                : "Digital Outcome Description"))))))))
            : "Topic Tasks"));
    const topicGuideInstructions = (() => {
        if (isProjectManagementTopic) {
            return [
                "Log in to Trello using Google Sign In.",
                "Create a board for this assessment if you do not already have one.",
                "Add three list headings: To Do, Doing, Done.",
                "Create or open your task card for this topic and keep it updated each lesson."
            ];
        }

        if (isDecompositionTopic) {
            return [
                "Open the Decomposition page for this task topic.",
                "Write one decomposed step per line in the planner.",
                "Select your Trello board, then choose the To Do list.",
                "Push the decomposition steps to Trello and track progress through Doing and Done."
            ];
        }

        if (isDigitalOutcomeTopic) {
            if (digitalOutcomeTopicKey === "relevant-digimed-conventions") {
                return [
                    "Create a Google Slideshow for this topic.",
                    "Use the conventions table below to check your digital media outcome.",
                    "Record which conventions apply and how your outcome follows them."
                ];
            }

            if (digitalOutcomeTopicKey === "user-experience-principles") {
                return [
                    "Create a Google Slideshow for this topic.",
                    "Use the UX principles table below to check your digital media outcome.",
                    "Record which UX principles apply and how your outcome follows them."
                ];
            }

            if (digitalOutcomeTopicKey === "target-audience") {
                return [
                    "Create a Google Slideshow for this topic.",
                    "Define who the target audience or end user is for your project.",
                    "Describe audience needs, context, and pain points your project should respond to.",
                    "Explain why this audience is the right focus and how your project decisions support them.",
                    "Use clear evidence, examples, or observations to justify your audience choices."
                ];
            }

            if (digitalOutcomeTopicKey === "development-steps") {
                return [
                    "Create a Google Slideshow for this topic.",
                    "Explain how your outcome will be developed from planning through implementation.",
                    "Name the tools and technologies you will use (for example: HTML/CSS/JS, Python, Trello, GitHub, Figma).",
                    "Justify why each tool is suitable for your project requirements and users.",
                    "Outline the build sequence so your development process is clear and testable."
                ];
            }

            if (digitalOutcomeTopicKey === "trialling-components") {
                return [
                    "Create a Google Slideshow for this topic.",
                    "Identify the components or features you will trial in your digital outcome.",
                    "Trial multiple components or techniques and record what happened.",
                    "Compare the results against your project requirements and user needs.",
                    "Select the most suitable option and justify your decision with evidence."
                ];
            }

            if (digitalOutcomeTopicKey === "success-criteria") {
                return [
                    "Create a Google Slideshow for this topic.",
                    "Define clear, measurable success criteria for your digital outcome.",
                    "Explain how success will be tested or evaluated (user feedback, testing results, rubric evidence).",
                    "Set indicators for what counts as achieved, partially achieved, or unmet.",
                    "Use evidence language so teachers can verify outcomes against your criteria."
                ];
            }

            if (digitalOutcomeTopicKey === "relevant-implications") {
                return [
                    "Create a Google Slideshow for this topic.",
                    "Identify the key relevant implications connected to your digital outcome.",
                    "Explain legal, ethical, social, and accessibility considerations that apply.",
                    "Describe risks and how you will address or mitigate each implication.",
                    "Use specific evidence from your design decisions to justify your responses."
                ];
            }

            if (digitalOutcomeTopicKey === "use-of-tools-and-techniques") {
                return [
                    "Review the Tools & Techniques detected from your project below.",
                    "Open your Use of Tools & Techniques slideshow (sync it from the Template Library if it is not linked yet).",
                    "For each detected tool or technique, add evidence (screenshots, code or file examples) showing where you used it.",
                    "Explain why each choice is appropriate for the purpose and the end users."
                ];
            }

            if (digitalOutcomeTopicKey === "code-validation") {
                return [
                    "Open the W3C Markup Validation Service at https://validator.w3.org/.",
                    "Paste your HTML file link (or upload the file) and run the check.",
                    "Fix any reported HTML errors, then re-validate until the file passes.",
                    "Switch to the CSS validator (https://jigsaw.w3.org/css-validator/) and repeat the process for your CSS file.",
                    "Record the validation results as evidence, noting any errors found and how you fixed them."
                ];
            }

            return [
                "Create a Google Slideshow for this topic.",
                "Include a slide that describes the digital outcome: what it is, who it is for, and what it must do.",
                "Record the assessment criteria page in Speaker Notes so markers can verify how each point is addressed.",
                "Explain the intent of the idea clearly: problem, purpose, audience, and expected impact.",
                "Use concise wording and evidence-based reasoning so your idea is easy to evaluate."
            ];
        }

        return [
            "Read each submission requirement carefully.",
            "Prepare evidence that matches the task expectations.",
            "Upload or link your evidence before acknowledging submission."
        ];
    })();
    const topicGuideTaskItems = (() => {
        if (isProjectManagementTopic) {
            return [
                "Copy your Trello board or card URL.",
                "Paste the URL into Project Management and click Save Trello Link.",
                "Send a daily Trello work log update from this page.",
                "Keep your card up to date so your teacher can verify progress."
            ];
        }

        if (isDecompositionTopic) {
            return [
                "Add decomposed tasks in the Decomposition page planner.",
                "Push the decomposed tasks to your Trello To Do list.",
                "Move tasks through Doing and Done as you complete them.",
                "Submit and acknowledge evidence after your plan and Trello tasks are updated."
            ];
        }

        if (isDigitalOutcomeTopic) {
            if (digitalOutcomeTopicKey === "relevant-digimed-conventions") {
                return [
                    "Relevant DigiMed Conventions - Google Slides: Use the table to review conventions for your media type.",
                    "Explain which conventions are most important for your outcome.",
                    "Record evidence of how your design and development follow the selected conventions."
                ];
            }

            if (digitalOutcomeTopicKey === "user-experience-principles") {
                return [
                    "User Experience (UX) Principles - Google Slides: Use the table to review UX principles for your outcome.",
                    "Explain which UX principles are most important for your outcome.",
                    "Record evidence of how your design and development follow the selected UX principles."
                ];
            }

            if (digitalOutcomeTopicKey === "target-audience") {
                return [
                    "Target Audience - Google Slides: Identify who your project is for and describe them clearly.",
                    "Describe demographics and context: age/role, environment, and likely use situation.",
                    "Describe psychographics and motivations: values, interests, and reasons they would use your project.",
                    "Identify pain points and explain how your project addresses those specific needs."
                ];
            }

            if (digitalOutcomeTopicKey === "development-steps") {
                return [
                    "Development Steps - Google Slides: Explain how your outcome will be developed.",
                    "List the tools/technologies you will use and what each tool is responsible for.",
                    "Describe your workflow from planning to build, testing, and refinement.",
                    "Justify why these tools are best for your audience and project requirements."
                ];
            }

            if (digitalOutcomeTopicKey === "trialling-components") {
                return [
                    "Trialling Components - Google Slides: Trial components or techniques and record the results.",
                    "Trial more than one option where appropriate and compare the outcomes.",
                    "Use testing or user feedback to evaluate each option.",
                    "Select the most suitable component and explain why it meets the requirements."
                ];
            }

            if (digitalOutcomeTopicKey === "success-criteria") {
                return [
                    "Success Criteria - Google Slides: State how success will be measured or evaluated.",
                    "Define measurable criteria (performance, usability, reliability, or engagement).",
                    "Explain what evidence will be collected and how it will be assessed.",
                    "Describe what outcomes indicate success, partial success, or unresolved issues."
                ];
            }

            if (digitalOutcomeTopicKey === "relevant-implications") {
                return [
                    "Relevant Implications - Google Slides: Explain the implications linked to your outcome.",
                    "Identify legal, ethical, social, and accessibility implications that apply.",
                    "Describe risks and impacts for users, stakeholders, and the wider context.",
                    "Justify mitigation actions you will take in design, development, and testing."
                ];
            }

            if (digitalOutcomeTopicKey === "use-of-tools-and-techniques") {
                return [
                    "Check the Tools & Techniques detected from your project are correct.",
                    "Link your Use of Tools & Techniques slideshow.",
                    "Add evidence and an explanation for each detected tool or technique.",
                    "Justify how each one suits the purpose and end users."
                ];
            }

            if (digitalOutcomeTopicKey === "code-validation") {
                return [
                    "Save the link to the HTML file you intend to validate in the HTML File Sync box.",
                    "Save the link to the CSS file you intend to validate in the CSS File Sync box.",
                    "Run both files through validator.w3.org and note any errors reported.",
                    "Fix the errors and re-run validation until both files pass with no errors."
                ];
            }

            return [
                "Description - Google Slides: Describe the Digital Outcome: what it is, who it is for, and what it must do.",
                "Identify the target audience or end user for this outcome.",
                "Explain how the outcome will be developed and what tools/technologies will be used.",
                "State how success will be measured or evaluated."
            ];
        }

        return submissionTaskItems;
    })();
    const topicGuideSourceUrl = (isProjectManagementTopic || isDecompositionTopic)
        ? "https://trello.com/"
        : (isDigitalOutcomeTopic ? slideshowTemplateLibraryUrl : "");
    const relevantDigiMedConventionsTableHtml = digitalOutcomeTopicKey === "relevant-digimed-conventions"
        ? (() => {
            const acknowledgements = readDigiMedConventionsAcknowledgements(id, readStoredHubEmail());
            const rows = [
                ["Navigation", "Consistent navigation, recognisable menu, logo/home link, descriptive links"],
                ["Layout", "Consistent page structure, alignment, grids, appropriate whitespace"],
                ["Typography", "Heading hierarchy, readable body text, consistent fonts"],
                ["Links", "Clearly identifiable and descriptive"],
                ["Buttons/Controls", "Consistent appearance, clear labels, predictable behaviour"],
                ["Forms", "Labels associated with inputs, logical order, feedback/error messages"],
                ["Visual hierarchy", "Important information visually prominent"],
                ["Images/Media", "Appropriate sizing, quality, placement and captions where relevant"],
                ["Consistency", "Repeated elements behave and appear consistently"],
                ["Responsive design", "Content/layout adapts appropriately to different screen sizes"],
                ["Feedback", "Users receive appropriate feedback when interacting"],
                ["Content organisation", "Headings, sections and grouping make information understandable"]
            ];
            return `<section class="task-topic-guide-block" id="digimed-conventions-table"><h3>Conventions (WEB)</h3><p class="task-topic-submission-note" id="digimed-conventions-last-sync">Last Sync: ${escapeHtml(String(readStoredTaskTopicSlideSyncEntryByTemplateId(id, readStoredHubEmail(), "relevant-digimed-conventions")?.savedAt || "Not yet"))}</p><table class="digital-outcome-must-dos-table digital-outcome-conventions-table"><thead><tr><th>Convention area</th><th>Possible website conventions</th><th>Discussed</th></tr></thead><tbody>
                ${rows.map(([area, description]) => `<tr><td>${escapeHtml(area)}</td><td>${escapeHtml(description)}</td><td class="digital-outcome-conventions-ack-cell"><label><input type="checkbox" data-digimed-convention-ack="${escapeHtml(area)}" ${acknowledgements[area] ? "checked" : ""}><span class="sr-only">Acknowledged ${escapeHtml(area)}</span></label></td></tr>`).join("")}
            </tbody></table></section>`;
        })()
        : "";
    const uxPrinciplesTableHtml = digitalOutcomeTopicKey === "user-experience-principles"
        ? (() => {
            const acknowledgements = readDigiMedUXPrinciplesAcknowledgements(id, readStoredHubEmail());
            const rows = [
                ["Visibility of system status", "The outcome keeps users informed with timely, appropriate feedback"],
                ["Match between system and the real world", "Familiar words, concepts and conventions from the real world"],
                ["User control and freedom", "Clear exits, undo/redo, and ways to leave unwanted actions"],
                ["Consistency and standards", "Consistent wording, layout and behaviour throughout the outcome"],
                ["Error prevention", "Design that prevents problems before they occur or confirms risky actions"],
                ["Recognition rather than recall", "Options, actions and instructions are visible or easily retrievable"],
                ["Flexibility and efficiency of use", "Shortcuts or options that suit both novice and experienced users"],
                ["Aesthetic and minimalist design", "Only relevant information is shown; no unnecessary clutter"],
                ["Help users recognise and recover from errors", "Clear error messages that explain the problem and a solution"],
                ["Accessibility", "Outcome is usable by people with a range of abilities and devices"]
            ];
            return `<section class="task-topic-guide-block"><h3>User Experience (UX) Principles</h3><p class="task-topic-submission-note" id="digimed-ux-principles-last-sync">Last Sync: ${escapeHtml(String(readStoredTaskTopicSlideSyncEntryByTemplateId(id, readStoredHubEmail(), "user-experience-principles")?.savedAt || "Not yet"))}</p><table class="digital-outcome-must-dos-table digital-outcome-conventions-table"><thead><tr><th>UX principle</th><th>What to look for</th><th>Discussed</th></tr></thead><tbody>
                ${rows.map(([area, description]) => `<tr><td>${escapeHtml(area)}</td><td>${escapeHtml(description)}</td><td class="digital-outcome-conventions-ack-cell"><label><input type="checkbox" data-digimed-ux-principle-ack="${escapeHtml(area)}" ${acknowledgements[area] ? "checked" : ""}><span class="sr-only">Acknowledged ${escapeHtml(area)}</span></label></td></tr>`).join("")}
            </tbody></table></section>`;
        })()
        : "";
    const videoIntegrityTestingChecklistHtml = digitalOutcomeTopicKey === "video-integrity-testing"
        ? (() => {
            const checks = readDigiMedVideoIntegrityChecks(id, readStoredHubEmail());
            return `<section class="task-topic-guide-block"><h3>Integrity &amp; Validation (VIDEO)</h3><p class="task-topic-submission-note">Check each area before exporting and submitting your final video outcome.</p><div class="task-list-decomposition-subtask-list">
                ${DIGIMED_VIDEO_INTEGRITY_CHECKS.map((check) => `<label class="task-list-decomposition-subtask ${checks[check] ? "is-complete" : ""}"><input type="checkbox" data-digimed-video-integrity-check="${escapeHtml(check)}" ${checks[check] ? "checked" : ""}><span>${escapeHtml(check)}</span></label>`).join("")}
            </div></section>`;
        })()
        : "";
    const imageIntegrityTestingChecklistHtml = digitalOutcomeTopicKey === "image-integrity-testing"
        ? (() => {
            const checks = readDigiMedImageIntegrityChecks(id, readStoredHubEmail());
            return `<section class="task-topic-guide-block"><h3>Integrity &amp; Validation (IMAGE)</h3><p class="task-topic-submission-note">Check each area before exporting and submitting your final image outcome.</p><div class="task-list-decomposition-subtask-list">
                ${DIGIMED_IMAGE_INTEGRITY_CHECKS.map(([check, description]) => `<label class="task-list-decomposition-subtask ${checks[check] ? "is-complete" : ""}"><input type="checkbox" data-digimed-image-integrity-check="${escapeHtml(check)}" ${checks[check] ? "checked" : ""}><span><strong>${escapeHtml(check)}</strong> - ${escapeHtml(description)}</span></label>`).join("")}
            </div></section>`;
        })()
        : "";
    const videoUXPrinciplesChecklistHtml = digitalOutcomeTopicKey === "video-ux-principles"
        ? (() => {
            const checks = readDigiMedVideoUXChecks(id, readStoredHubEmail());
            return `<section class="task-topic-guide-block"><h3>UX Principles (Video)</h3><p class="task-topic-submission-note">Review how your video outcome works for its intended audience and tick each principle you have addressed.</p><div class="task-list-decomposition-subtask-list">
                ${DIGIMED_VIDEO_UX_CHECKS.map(([principle, prompt]) => `<label class="task-list-decomposition-subtask ${checks[principle] ? "is-complete" : ""}"><input type="checkbox" data-digimed-video-ux-check="${escapeHtml(principle)}" ${checks[principle] ? "checked" : ""}><span><strong>${escapeHtml(principle)}</strong> - ${escapeHtml(prompt)}</span></label>`).join("")}
            </div></section>`;
        })()
        : "";
    const videoConventionsChecklistHtml = digitalOutcomeTopicKey === "video-conventions"
        ? (() => {
            const checks = readDigiMedVideoConventionsChecks(id, readStoredHubEmail());
            return `<section class="task-topic-guide-block"><h3>Conventions (VIDEO)</h3><p class="task-topic-submission-note">Review the conventions that apply to your video outcome and tick each one you have addressed.</p><div class="task-list-decomposition-subtask-list">
                ${DIGIMED_VIDEO_CONVENTION_CHECKS.map(([convention, examples]) => `<label class="task-list-decomposition-subtask ${checks[convention] ? "is-complete" : ""}"><input type="checkbox" data-digimed-video-convention-check="${escapeHtml(convention)}" ${checks[convention] ? "checked" : ""}><span><strong>${escapeHtml(convention)}</strong> - ${escapeHtml(examples)}</span></label>`).join("")}
            </div></section>`;
        })()
        : "";
    const topicGuideIntroText = (() => {
        if (!isDigitalOutcomeTopic) {
            return "Use this guide to complete the Submission Tasks correctly.";
        }
        if (digitalOutcomeTopicKey === "target-audience") {
            return "Use this guide to define your project's target audience clearly and justify why they are the right users to design for.";
        }
        if (digitalOutcomeTopicKey === "tools-and-techniques") {
            return "List the tools you plan to use, are currently using, or have used for this task, and describe the techniques you implement with each one.";
        }
        if (digitalOutcomeTopicKey === "use-of-tools-and-techniques") {
            return "Use this guide to show the tools and techniques you used in your outcome and explain why they suit the purpose and end users.";
        }
        if (digitalOutcomeTopicKey === "trialling-components") {
            return "Use this guide to trial components systematically, compare evidence, and justify the option you select.";
        }
        if (digitalOutcomeTopicKey === "development-steps") {
            return "Use this guide to plan and record a clear development process from idea through implementation.";
        }
        if (digitalOutcomeTopicKey === "success-criteria") {
            return "Use this guide to define measurable success criteria and explain how your outcome will be evaluated.";
        }
        if (digitalOutcomeTopicKey === "relevant-implications") {
            return "Use this guide to identify relevant implications and justify how your project addresses them.";
        }
        if (digitalOutcomeTopicKey === "code-validation") {
            return "Use this guide to check your HTML and CSS files for errors using the W3C validators before submitting evidence.";
        }
        return "Use this guide to write and record a clear description of your digital outcome before starting development.";
    })();
    const topicGuideTaskHeading = (() => {
        if (isProjectManagementTopic) {
            return "Trello Tasks";
        }
        if (!isDigitalOutcomeTopic) {
            return "Task List";
        }
        if (digitalOutcomeTopicKey === "target-audience") {
            return "Target Audience - Google Slides";
        }
        if (digitalOutcomeTopicKey === "tools-and-techniques") {
            return "Tools & Techniques Table";
        }
        if (digitalOutcomeTopicKey === "use-of-tools-and-techniques") {
            return "Use of Tools & Techniques - Google Slides";
        }
        if (digitalOutcomeTopicKey === "development-steps") {
            return "Development Steps - Google Slides";
        }
        if (digitalOutcomeTopicKey === "trialling-components") {
            return "Trialling Components - Google Slides";
        }
        if (digitalOutcomeTopicKey === "success-criteria") {
            return "Success Criteria - Google Slides";
        }
        if (digitalOutcomeTopicKey === "relevant-implications") {
            return "Relevant Implications - Google Slides";
        }
        if (digitalOutcomeTopicKey === "code-validation") {
            return "Code Validation Checklist";
        }
        return "Description - Google Slides";
    })();
    const githubGuideTitle = "Version Control: GitHub";
    const githubGuideSourceUrl = "https://github.com/";
    const githubGuideInstructions = [
        "Log in to GitHub using Google Sign In (or your school-linked GitHub account).",
        "Create a repository for this assessment project.",
        "Add a clear README with your project purpose and key milestones.",
        "Use commits regularly so your progress history is visible to your teacher."
    ];
    const githubGuideTaskItems = [
        "Create TODO, DOING, and DONE tracking items in your repo (Project board or Issues).",
        "Link commit messages to the task you completed.",
        "Push your latest changes before each lesson ends.",
        "Copy your GitHub repository URL and keep it available for submission evidence."
    ];
    const oneDriveGuideTitle = "Version Control: Microsoft OneDrive";
    const oneDriveGuideSourceUrl = "https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage";
    const oneDriveGuideInstructions = [
        "Log in to Microsoft OneDrive with your school account.",
        "Open Documents in OneDrive and create a project folder for this assessment.",
        "Keep all project source files inside that OneDrive Documents project folder.",
        "Copy the share link for the folder and paste it into DTECH HUB on this page."
    ];
    const oneDriveGuideTaskItems = [
        "Create a project folder path like Documents/AssessmentName/ProjectName.",
        "Use clear version file names such as v01, v02, v03.",
        "Save working files and exports into your OneDrive project folder, not local temporary folders.",
        "Keep the DTECH HUB OneDrive folder link updated for teacher access."
    ];
    const oneDriveGuideWarning = "Important: Downloads and Videos folders are not backed up to OneDrive. Save project files in your OneDrive Documents project folder.";
    const googleDriveGuideTitle = "Version Control: Google Drive";
    const googleDriveGuideSourceUrl = "https://workspace.google.com/products/drive/";
    const googleDriveGuideInstructions = [
        "Log in to Google Drive with your school account.",
        "Create a project folder for this assessment and keep all source files in that folder.",
        "Open the Share settings for the project folder.",
        "Set sharing to Anyone with a link and copy the folder URL into DTECH HUB on this page."
    ];
    const googleDriveGuideTaskItems = [
        "Create a folder path like My Drive/AssessmentName/ProjectName.",
        "Use clear version file names such as v01, v02, v03.",
        "Keep exports and working files in the same Google Drive project folder.",
        "Recheck that folder sharing remains Anyone with a link so teachers can verify your evidence."
    ];
    const googleDriveGuideWarningHtml = "Important: Set sharing to <span class=\"task-topic-guide-alert-highlight\">Anyone with a link</span> so your teacher can open the folder evidence.";
    if (!submissionTaskItems.length) {
        submissionTaskItems.push("Upload evidence that clearly demonstrates completion of this task topic.");
    }

    host.classList.toggle("task-topic-screen", isTaskTopicView);
    host.classList.toggle("student-task-topic-screen", isStudentTaskTopicView);

    host.innerHTML = `
        <header class="toolbar">
            <span class="toolbar-label">${toolbarLabel}</span>
            <div class="toolbar-actions">
                ${canConvertCategory ? `
                    <div class="detail-convert-actions" role="group" aria-label="Convert category">
                        <button type="button" class="detail-action detail-action-secondary" data-convert-category="Project" ${normalizedCategory === "Project" ? "disabled" : ""}>Convert to Project</button>
                        <button type="button" class="detail-action detail-action-secondary" data-convert-category="Assessment Task" ${normalizedCategory === "Assessment Task" ? "disabled" : ""}>Convert to Assessment</button>
                        <button type="button" class="detail-action detail-action-secondary" data-convert-category="Activity" ${normalizedCategory === "Activity" ? "disabled" : ""}>Convert to Activity</button>
                        <button type="button" class="detail-action detail-action-secondary" id="detail-reapply-category-color">Reapply Category Color</button>
                    </div>
                ` : ""}
                ${canEdit ? '<button type="button" class="detail-action" id="detail-edit-button">Edit Details</button>' : ""}
                ${canEdit ? '<button type="button" class="detail-action detail-action-danger" id="detail-delete-button">Delete</button>' : ""}
                ${isTaskTopicView && isDigitalOutcomeTopic ? '<button type="button" class="detail-action" id="task-topic-sync-slides-btn">Sync Slideshow</button>' : ""}
                <a href="../index.html">Back to Hub</a>
            </div>
        </header>

        <section class="hero">
            <div class="hero-copy">
                <h1>${escapeHtml(displayTitle)}</h1>
                <div class="pills">
                    <span class="pill">${escapeHtml(data.yearLevel)}</span>
                    <span class="pill">${escapeHtml(data.type)}</span>
                    <span class="pill">${escapeHtml(data.duration)}</span>
                    ${taskTopicTitle ? '<span class="pill">Task Topic</span>' : ""}
                </div>
                <p>${displaySummaryHtml}</p>
            </div>
            <div class="hero-image">
                ${heroImageHtml}
            </div>
        </section>

        <div class="detail-under-hero-actions" id="detail-under-hero-actions"></div>

        ${
            isTaskTopicView ? `
            <div class="task-topic-detail-layout">
                <div class="task-topic-detail-main">
                    <section class="proposal-section task-topic-card-basics">
                        <h2>Card Basics</h2>
                        <div class="task-topic-card-grid">
                            <div class="task-topic-card-field">
                                <span class="task-topic-card-label">Card Name</span>
                                <p class="task-topic-card-value">${escapeHtml(displayTitle)}</p>
                            </div>
                            <div class="task-topic-card-field">
                                <span class="task-topic-card-label">Year Level</span>
                                <p class="task-topic-card-value">Senior</p>
                            </div>
                            <div class="task-topic-card-field">
                                <span class="task-topic-card-label">Card Category</span>
                                <p class="task-topic-card-value">Task Topic</p>
                            </div>
                            <div class="task-topic-card-field">
                                <span class="task-topic-card-label">Subject Stream</span>
                                <p class="task-topic-card-value">DTECH</p>
                            </div>
                            <div class="task-topic-card-field">
                                <span class="task-topic-card-label">Topic Type</span>
                                <p class="task-topic-card-value">Process</p>
                            </div>
                            <div class="task-topic-card-field">
                                <span class="task-topic-card-label">Difficulty</span>
                                <p class="task-topic-card-value">Intermediate</p>
                            </div>
                            <div class="task-topic-card-field task-topic-card-field-full">
                                <span class="task-topic-card-label">Card URL</span>
                                <p class="task-topic-card-value"><a href="${escapeHtml(standardTaskTopicUrl)}" target="_blank" rel="noreferrer">${escapeHtml(standardTaskTopicUrl)}</a></p>
                            </div>
                            <div class="task-topic-card-field task-topic-card-field-full">
                                <span class="task-topic-card-label">Short Description</span>
                                <p class="task-topic-card-value">${escapeHtml(taskTopicTitle)}</p>
                            </div>
                        </div>
                    </section>

                    ${showMergedTaskTopicLayout ? `
                    <section class="proposal-section task-topic-merged-overview">
                        <div class="task-topic-merged-grid">
                            <article class="task-topic-merged-column task-topic-standards-panel">
                                <h2>Standard Details</h2>
                                ${taskTopicStandardDetails.length
                                    ? `<div class="task-topic-standard-list task-topic-standard-list-prominent">${taskTopicStandardDetails.map((line) => `<span class="task-topic-standard-chip task-topic-standard-chip-prominent">${escapeHtml(line)}</span>`).join("")}</div>`
                                    : `<p class="task-topic-card-value">No standards linked.</p>`
                                }
                            </article>
                            <article class="task-topic-merged-column task-topic-merged-links-panel">
                                <h2>Merged Task Topic Cards</h2>
                                <p class="task-topic-merged-links-subtitle">Open each merged card from its level.</p>
                                <ul class="task-topic-merged-links-list">
                                    ${mergedTaskTopicLinks.map((entry) => `
                                        <li class="task-topic-merged-link-item">
                                            ${entry.isCurrent
                                                ? `<span class="task-topic-merged-link current">${escapeHtml(entry.topicText)}</span>`
                                                : `<a class="task-topic-merged-link" href="${escapeHtml(entry.href)}">${escapeHtml(entry.topicText)}</a>`
                                            }
                                            <div class="task-topic-merged-pills">
                                                <span class="task-topic-merged-level">${escapeHtml(entry.levelLabel)}</span>
                                                ${mergedStandardNumber ? `<span class="task-topic-merged-standard">${escapeHtml(mergedStandardNumber)}</span>` : ""}
                                            </div>
                                        </li>
                                    `).join("")}
                                </ul>
                            </article>
                        </div>
                    </section>
                    ` : `
                    <section class="proposal-section task-topic-standards-panel">
                        <h2>Standard Details</h2>
                        ${taskTopicStandardDetails.length
                            ? `<div class="task-topic-standard-list task-topic-standard-list-prominent">${taskTopicStandardDetails.map((line) => `<span class="task-topic-standard-chip task-topic-standard-chip-prominent">${escapeHtml(line)}</span>`).join("")}</div>`
                            : `<p class="task-topic-card-value">No standards linked.</p>`
                        }
                    </section>
                    `}

                    ${canEdit ? `
                    <section class="proposal-section task-topic-display-options">
                        <h2>Display Options</h2>
                        <div class="task-topic-display-grid">
                            <div class="task-topic-card-field task-topic-card-field-full">
                                <span class="task-topic-card-label">Card Colour</span>
                                <p class="task-topic-card-value">Azure</p>
                            </div>
                            <div class="task-topic-display-check">
                                <span class="task-topic-check-box" aria-hidden="true"></span>
                                <span>Time Sensitive</span>
                            </div>
                            <div class="task-topic-display-check is-checked">
                                <span class="task-topic-check-box" aria-hidden="true">✓</span>
                                <span>Show In This Week Section</span>
                            </div>
                        </div>
                    </section>
                    ` : ""}
                </div>

                <aside class="task-topic-submission-column${isDigitalOutcomeTopic ? " task-topic-submission-column-digital-outcome" : ""}">
                    <div class="task-topic-sync-grid">
                    <section class="proposal-section task-topic-guide-panel">
                        ${isDigitalOutcomeDescriptionTopic ? `
                            <section class="task-topic-guide-block">
                                <h3>DESCRIPTION - GOOGLE SLIDES</h3>
                                <ul class="list task-topic-guide-list">${renderList(topicGuideTaskItems)}</ul>
                                <div class="digital-outcome-must-dos" id="digital-outcome-must-dos" aria-live="polite">
                                    <p class="task-topic-submission-note">Loading MUST-DOs from your slideshow...</p>
                                </div>
                            </section>
                        ` : `
                            <p class="task-topic-guide-eyebrow">Topic Tasks</p>
                            <h2>${escapeHtml(topicGuideTitle)}</h2>
                            <p class="task-topic-guide-intro">${escapeHtml(topicGuideIntroText)}</p>
                            ${topicGuideSourceUrl ? `<p class="task-topic-guide-source">Source: <a href="${escapeHtml(topicGuideSourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(topicGuideSourceUrl)}</a></p>` : ""}

                            <section class="task-topic-guide-block">
                                <h3>Instructions</h3>
                                <ul class="list task-topic-guide-list">${renderList(topicGuideInstructions)}</ul>
                            </section>

                            <section class="task-topic-guide-block">
                                <h3>${escapeHtml(topicGuideTaskHeading)}</h3>
                                <ul class="list task-topic-guide-list">${renderList(topicGuideTaskItems)}</ul>
                            </section>
                            ${relevantDigiMedConventionsTableHtml}
                            ${uxPrinciplesTableHtml}
                            ${videoIntegrityTestingChecklistHtml}
                            ${imageIntegrityTestingChecklistHtml}
                            ${videoUXPrinciplesChecklistHtml}
                            ${videoConventionsChecklistHtml}
                            ${isRelevantImplicationsTopic
                                ? `<div class="digital-outcome-must-dos" id="relevant-implications-from-slide" aria-live="polite"><p class="task-topic-submission-note">Loading discussed implications from your slideshow...</p></div>`
                                : ""}
                            ${isDigitalOutcomeSuccessCriteriaTopic
                                ? `<div class="digital-outcome-must-dos" id="success-criteria-must-dos" aria-live="polite"><p class="task-topic-submission-note">Loading MUST-DOs from your Digital Outcome Description slideshow...</p></div><div class="digital-outcome-must-dos" id="success-criteria-relevant-implications" aria-live="polite"><p class="task-topic-submission-note">Loading Relevant Implications slideshows...</p></div>`
                                : ""}
                            ${isDigitalOutcomeDevelopmentToolsTopic && !isUseOfToolsTechniquesTopic
                                ? `<div class="digital-outcome-must-dos" id="development-steps-must-dos" aria-live="polite"><p class="task-topic-submission-note">Loading MUST-DOs from your Digital Outcome Description slideshow...</p></div>`
                                : ""}
                            ${isUseOfToolsTechniquesTopic ? `<div id="use-of-tools-techniques-slot"></div>` : ""}
                            ${isDigitalOutcomeTriallingComponentsTopic
                                ? `<div class="digital-outcome-must-dos" id="trialling-components-table" aria-live="polite"><p class="task-topic-submission-note">Loading components from your Development Steps slideshow...</p></div>`
                                : ""}
                            ${isDigitalOutcomeTestingFunctionsTopic
                                ? `<div class="digital-outcome-must-dos" id="testing-functions-lists" aria-live="polite"><p class="task-topic-submission-note">Loading your Functional Testing and User Testing lists...</p></div><div id="task-topic-google-form-sync-slot"></div>`
                                : ""}
                        `}

                        ${isProjectManagementTopic ? `
                            <div id="task-topic-trello-sync-slot"></div>
                            <div id="task-topic-github-sync-slot"></div>
                            <div id="task-topic-onedrive-sync-slot"></div>
                            <div id="task-topic-google-drive-sync-slot"></div>
                        ` : ""}
                    </section>

                    ${showGithubGuide ? `
                    <section class="proposal-section task-topic-guide-panel">
                        <p class="task-topic-guide-eyebrow">Topic Tasks</p>
                        <h2>${escapeHtml(githubGuideTitle)}</h2>
                        <p class="task-topic-guide-intro">Use this guide to track version control evidence alongside your Trello workflow.</p>
                        <p class="task-topic-guide-source">Source: <a href="${escapeHtml(githubGuideSourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(githubGuideSourceUrl)}</a></p>

                        <section class="task-topic-guide-block">
                            <h3>Instructions</h3>
                            <ul class="list task-topic-guide-list">${renderList(githubGuideInstructions)}</ul>
                        </section>

                        <section class="task-topic-guide-block">
                            <h3>GitHub Tasks</h3>
                            <ul class="list task-topic-guide-list">${renderList(githubGuideTaskItems)}</ul>
                        </section>

                        <div id="task-topic-github-sync-slot"></div>
                    </section>
                    ` : ""}
                    </div>

                    ${showOneDriveGuide ? `
                    <div class="task-topic-sync-grid">
                    <section class="proposal-section task-topic-guide-panel">
                        <p class="task-topic-guide-eyebrow">Topic Tasks</p>
                        <h2>${escapeHtml(oneDriveGuideTitle)}</h2>
                        <p class="task-topic-guide-intro">Use this guide for image/video version control and teacher folder access tracking.</p>
                        <p class="task-topic-guide-source">Source: <a href="${escapeHtml(oneDriveGuideSourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(oneDriveGuideSourceUrl)}</a></p>
                        <p class="task-topic-guide-alert">${escapeHtml(oneDriveGuideWarning)}</p>

                        <section class="task-topic-guide-block">
                            <h3>Instructions</h3>
                            <ul class="list task-topic-guide-list">${renderList(oneDriveGuideInstructions)}</ul>
                        </section>

                        <section class="task-topic-guide-block">
                            <h3>OneDrive Tasks</h3>
                            <ul class="list task-topic-guide-list">${renderList(oneDriveGuideTaskItems)}</ul>
                        </section>

                        <div id="task-topic-onedrive-sync-slot"></div>
                    </section>
                    </div>
                    ` : ""}

                    ${showGoogleDriveGuide ? `
                    <div class="task-topic-sync-grid">
                    <section class="proposal-section task-topic-guide-panel">
                        <p class="task-topic-guide-eyebrow">Topic Tasks</p>
                        <h2>${escapeHtml(googleDriveGuideTitle)}</h2>
                        <p class="task-topic-guide-intro">Use this guide if you are managing version control files in Google Drive.</p>
                        <p class="task-topic-guide-source">Source: <a href="${escapeHtml(googleDriveGuideSourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(googleDriveGuideSourceUrl)}</a></p>
                        <p class="task-topic-guide-alert">${googleDriveGuideWarningHtml}</p>

                        <section class="task-topic-guide-block">
                            <h3>Instructions</h3>
                            <ul class="list task-topic-guide-list">${renderList(googleDriveGuideInstructions)}</ul>
                        </section>

                        <section class="task-topic-guide-block">
                            <h3>Google Drive Tasks</h3>
                            <ul class="list task-topic-guide-list">${renderList(googleDriveGuideTaskItems)}</ul>
                        </section>

                        <div id="task-topic-google-drive-sync-slot"></div>
                    </section>
                    </div>
                    ` : ""}

                    ${showCodeValidationGuide ? `
                    <div class="task-topic-sync-grid">
                    <section class="proposal-section task-topic-guide-panel">
                        <p class="task-topic-guide-eyebrow">Topic Tasks</p>
                        <h2>HTML File Sync</h2>
                        <p class="task-topic-guide-intro">Save the link to the HTML file you intend to validate.</p>
                        <div id="task-topic-html-file-sync-slot"></div>
                    </section>

                    <section class="proposal-section task-topic-guide-panel">
                        <p class="task-topic-guide-eyebrow">Topic Tasks</p>
                        <h2>CSS File Sync</h2>
                        <p class="task-topic-guide-intro">Save the link to the CSS file you intend to validate.</p>
                        <div id="task-topic-css-file-sync-slot"></div>
                    </section>
                    </div>
                    <section class="proposal-section task-topic-guide-panel">
                        <p class="task-topic-guide-eyebrow">Topic Tasks</p>
                        <h2>Validation &amp; Technical Health Tracker</h2>
                        <div id="task-topic-technical-health-slot"></div>
                    </section>
                    ` : ""}

                    <section class="proposal-section task-topic-submission-panel" ${isDigitalOutcomeDescriptionTopic || isDigitalOutcomeSuccessCriteriaTopic || isDigitalOutcomeDevelopmentToolsTopic || isDigitalOutcomeRelevantDigiMedConventionsTopic || isDigitalOutcomeUXPrinciplesTopic || isToolsAndTechniquesTopic ? "hidden" : ""}>
                        ${isDecompositionTopic ? "" : `
                        <h2>Submission Tasks</h2>
                        <p class="task-topic-submission-intro">${escapeHtml(submissionIntroText)}</p>
                        <div class="task-topic-submission-evidence-type">
                            <span class="task-topic-card-label">Primary Evidence Type</span>
                            <p class="task-topic-card-value">${submissionPrimaryEvidenceType}</p>
                        </div>
                        <ul class="list task-topic-submission-list">${renderList(submissionTaskItems)}</ul>
                        `}
                        <div id="task-topic-submission-live-panel" class="task-topic-submission-live-panel"></div>
                    </section>

                    ${relevantImplicationNotes.length ? `
                    <section class="proposal-section task-topic-submission-panel">
                        <h2>Relevant Implications Focus</h2>
                        <ul class="list task-topic-submission-list">${renderList(relevantImplicationNotes)}</ul>
                    </section>
                    ` : ""}
                </aside>
            </div>
            ` : ""
        }

        <section class="proposal-details" ${isTaskTopicView ? 'hidden' : ""}>
            ${data.startDate ? `<div class="detail-row"><strong>EST. Start Date:</strong> <span>${escapeHtml(data.startDate)}</span></div>` : ""}
        </section>

        ${
            !isTaskTopicView && isAssessmentTask && data.summary ? `
            <section class="proposal-section">
                <h2>Short Description</h2>
                <p>${escapeHtml(data.summary)}</p>
            </section>
            ` : ""
        }

        ${
            !isTaskTopicView && isAssessmentTask && resolvedTasksList.length ? `
            <section class="proposal-section">
                <h2>Task List</h2>
                <ol class="list">${renderList(resolvedTasksList)}</ol>
            </section>
            ` : ""
        }

        ${
            data.contactName || data.company || data.address ? `
            <section class="proposal-section">
                <h2>Client's Contact Information</h2>
                <div class="detail-grid">
                    ${data.contactName ? `<div class="detail-field"><strong>Contact Name:</strong> ${escapeHtml(data.contactName)}</div>` : ""}
                    ${data.contactPhone ? `<div class="detail-field"><strong>Phone:</strong> ${escapeHtml(data.contactPhone)}</div>` : ""}
                    ${data.contactEmail ? `<div class="detail-field"><strong>Email:</strong> <a href="mailto:${escapeHtml(data.contactEmail)}">${escapeHtml(data.contactEmail)}</a></div>` : ""}
                    ${data.company ? `<div class="detail-field"><strong>Company:</strong> ${escapeHtml(data.company)}</div>` : ""}
                    ${data.address ? `<div class="detail-field detail-field-full"><strong>Address:</strong> ${escapeHtml(data.address)}</div>` : ""}
                </div>
            </section>
            ` : ""
        }

        ${
            data.overview.length ? `
            <section class="proposal-section">
                <h2>${escapeHtml(data.company ? data.company : "Project")} Overview and Needs</h2>
                <ul class="list">${renderList(data.overview)}</ul>
            </section>
            ` : ""
        }

        ${
            data.services.length ? `
            <section class="proposal-section">
                <h2>Services Provided</h2>
                <ul class="list">${renderList(data.services)}</ul>
            </section>
            ` : ""
        }

        ${
            data.costs.length ? `
            <section class="proposal-section">
                <h2>Estimated Service Cost to be Incurred by Client</h2>
                <ul class="list">${renderList(data.costs)}</ul>
            </section>
            ` : ""
        }

        ${
            data.outcomes.length ? `
            <section class="proposal-section">
                <h2>Positive Outcomes of the Services Provided</h2>
                <ul class="list">${renderList(data.outcomes)}</ul>
            </section>
            ` : ""
        }

        ${
            data.withdrawalDate ? `
            <section class="proposal-section">
                <h2>All-or-Nothing Terms</h2>
                <p class="detail-field"><strong>Withdrawal if not Accepted by Date of:</strong> <span>${escapeHtml(data.withdrawalDate)}</span></p>
            </section>
            ` : ""
        }

        ${
            data.clientId ? `
            <section class="proposal-section">
                <h2>Project Client Details</h2>
                <p class="detail-field"><strong>Client ID / Details:</strong> <span>${escapeHtml(data.clientId)}</span></p>
            </section>
            ` : ""
        }

        ${
            data.resources.length || data.equipment.length || data.instructions.length || cardUrl ? `
            <section class="grid">
                ${data.resources.length || cardUrl ? `<article class="card">
                    <h2>Resources</h2>
                    <p class="sub">Materials needed.</p>
                    ${data.resources.length ? `<ul class="list">${renderList(data.resources)}</ul>` : ""}
                    ${cardUrl ? `<div class="card-url-box">
                        <p class="card-url-label">Card URL</p>
                        <a class="card-url-link" href="${escapeHtml(cardUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cardUrl)}</a>
                    </div>` : ""}
                </article>` : ""}
                ${data.equipment.length ? `<article class="card">
                    <h2>Equipment</h2>
                    <p class="sub">Tools and systems used.</p>
                    <ul class="list">${renderList(data.equipment)}</ul>
                </article>` : ""}
                ${data.instructions.length ? `<article class="card">
                    <h2>Instructions</h2>
                    <p class="sub">Step-by-step method.</p>
                    <ol class="list">${renderList(data.instructions)}</ol>
                </article>` : ""}
            </section>
            ` : ""
        }
    `;

    if (digitalOutcomeTopicKey === "relevant-digimed-conventions") {
        const acknowledgements = readDigiMedConventionsAcknowledgements(id, readStoredHubEmail());
        host.querySelectorAll("[data-digimed-convention-ack]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const area = String(checkbox.getAttribute("data-digimed-convention-ack") || "").trim();
                if (!area) return;
                acknowledgements[area] = Boolean(checkbox.checked);
                writeDigiMedConventionsAcknowledgements(id, readStoredHubEmail(), acknowledgements);
            });
        });
        if (!canEdit && readStoredHubEmail()) {
            void syncDigiMedConventionsFromSlide(id, readStoredHubEmail(), taskTopicTitle)
                .then((result) => {
                    if (!result) return;
                    host.querySelectorAll("[data-digimed-convention-ack]").forEach((checkbox) => {
                        checkbox.checked = Boolean(result.acknowledgements[checkbox.getAttribute("data-digimed-convention-ack") || ""]);
                    });
                    const lastSync = host.querySelector("#digimed-conventions-last-sync");
                    if (lastSync && result.syncedAt) lastSync.textContent = `Last Sync: ${formatSyncCreatedDate(result.syncedAt)}`;
                })
                .catch((error) => console.warn("Could not sync Relevant DigiMed Conventions.", error));
        }
    }

    if (digitalOutcomeTopicKey === "user-experience-principles") {
        const acknowledgements = readDigiMedUXPrinciplesAcknowledgements(id, readStoredHubEmail());
        host.querySelectorAll("[data-digimed-ux-principle-ack]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const area = String(checkbox.getAttribute("data-digimed-ux-principle-ack") || "").trim();
                if (!area) return;
                acknowledgements[area] = Boolean(checkbox.checked);
                writeDigiMedUXPrinciplesAcknowledgements(id, readStoredHubEmail(), acknowledgements);
            });
        });
    }

    if (digitalOutcomeTopicKey === "video-integrity-testing") {
        const checks = readDigiMedVideoIntegrityChecks(id, readStoredHubEmail());
        host.querySelectorAll("[data-digimed-video-integrity-check]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const check = String(checkbox.getAttribute("data-digimed-video-integrity-check") || "").trim();
                if (!check) return;
                checks[check] = Boolean(checkbox.checked);
                writeDigiMedVideoIntegrityChecks(id, readStoredHubEmail(), checks);
                checkbox.closest(".task-list-decomposition-subtask")?.classList.toggle("is-complete", Boolean(checkbox.checked));
            });
        });
    }

    if (digitalOutcomeTopicKey === "image-integrity-testing") {
        const checks = readDigiMedImageIntegrityChecks(id, readStoredHubEmail());
        host.querySelectorAll("[data-digimed-image-integrity-check]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const check = String(checkbox.getAttribute("data-digimed-image-integrity-check") || "").trim();
                if (!check) return;
                checks[check] = Boolean(checkbox.checked);
                writeDigiMedImageIntegrityChecks(id, readStoredHubEmail(), checks);
                checkbox.closest(".task-list-decomposition-subtask")?.classList.toggle("is-complete", Boolean(checkbox.checked));
            });
        });
    }

    if (digitalOutcomeTopicKey === "video-ux-principles") {
        const checks = readDigiMedVideoUXChecks(id, readStoredHubEmail());
        host.querySelectorAll("[data-digimed-video-ux-check]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const principle = String(checkbox.getAttribute("data-digimed-video-ux-check") || "").trim();
                if (!principle) return;
                checks[principle] = Boolean(checkbox.checked);
                writeDigiMedVideoUXChecks(id, readStoredHubEmail(), checks);
                checkbox.closest(".task-list-decomposition-subtask")?.classList.toggle("is-complete", Boolean(checkbox.checked));
            });
        });
    }

    if (digitalOutcomeTopicKey === "video-conventions") {
        const checks = readDigiMedVideoConventionsChecks(id, readStoredHubEmail());
        host.querySelectorAll("[data-digimed-video-convention-check]").forEach((checkbox) => {
            checkbox.addEventListener("change", () => {
                const convention = String(checkbox.getAttribute("data-digimed-video-convention-check") || "").trim();
                if (!convention) return;
                checks[convention] = Boolean(checkbox.checked);
                writeDigiMedVideoConventionsChecks(id, readStoredHubEmail(), checks);
                checkbox.closest(".task-list-decomposition-subtask")?.classList.toggle("is-complete", Boolean(checkbox.checked));
            });
        });
    }

    const editButton = host.querySelector("#detail-edit-button");
    const deleteButton = host.querySelector("#detail-delete-button");
    if (editButton) {
        // If this is a backend upload, route to the matching uploader page for prefilled editing.
        if (String(id).match(/^\d+$/)) {
            editButton.addEventListener("click", () => {
                const category = String(data?.activityCategory || "").toLowerCase();

                let targetPage = "../upload-activity.html";
                if (isTaskTopicView) {
                    void renderTaskTopicEditForm(host, id, data, canEdit, taskTopicTitle, selectedTaskShortName);
                    return;
                }
                if (category.includes("assessment")) {
                    targetPage = "../upload-assessment.html";
                } else if (category.includes("project")) {
                    targetPage = "../upload-project.html";
                }
                window.location.href = `${targetPage}?id=${encodeURIComponent(id)}`;
            });
        } else {
            // For base activities, use the in-place edit form
            editButton.addEventListener("click", () => renderEditForm(host, id, data));
        }
    }

    if (deleteButton) {
        deleteButton.addEventListener("click", async () => {
            const confirmed = window.confirm(`Delete "${data.title}"? This cannot be undone.`);
            if (!confirmed) {
                return;
            }

            deleteButton.disabled = true;
            try {
                await deleteDetails(id);
                window.location.href = "../index.html#project-library";
            } catch (error) {
                deleteButton.disabled = false;
                window.alert(error.message || "Could not delete this activity/project.");
            }
        });
    }

    // Topics without a dedicated static hero image (e.g. teacher-managed templates like Conventions/UX Principles)
    // fetch their live Template Library thumbnail here, so both teacher and student views show the real synced slide.
    if (useDigitalOutcomeTemplateHero) {
        const topicsWithDedicatedHeroImage = new Set(["target-audience", "tools-and-techniques", "relevant-implications", "description"]);
        if (!topicsWithDedicatedHeroImage.has(digitalOutcomeTopicKey)) {
            fetchTemplateLibraryPreviewByTemplateId(preferredTemplateId)
                .then((canonicalPreviewUrl) => {
                    if (canonicalPreviewUrl) {
                        updateTaskTopicTemplateHeroPreview(host, canonicalPreviewUrl, displayTitle, canonicalPreviewUrl);
                    }
                })
                .catch(() => {});
        }
    }

    const syncSlidesBtn = host.querySelector("#task-topic-sync-slides-btn");
    if (syncSlidesBtn && isTaskTopicView && useDigitalOutcomeTemplateHero) {
        syncSlidesBtn.addEventListener("click", async () => {
            const ctx = getActiveSyncContext();
            if (!ctx.projectId || !ctx.email) {
                window.alert("Could not determine project or email. Please refresh and try again.");
                return;
            }

            const isTargetAudienceTopic = isDigitalOutcomeTargetAudienceCriterion(taskTopicTitle, resolvedTaskShortName)
                || keywordMatchedTopicKey === "target-audience";
            const isDevelopmentToolsTopic = isDigitalOutcomeDevelopmentToolsCriterion(taskTopicTitle, resolvedTaskShortName)
                || keywordMatchedTopicKey === "development-steps";
            const isTriallingComponentsTopic = isDigitalOutcomeTriallingComponentsCriterion(taskTopicTitle, resolvedTaskShortName)
                || keywordMatchedTopicKey === "trialling-components";
            const isSuccessCriteriaTopic = isDigitalOutcomeSuccessCriteriaCriterion(taskTopicTitle, resolvedTaskShortName)
                || keywordMatchedTopicKey === "success-criteria";
            const isRelevantImplicationsTopic = isDigitalOutcomeRelevantImplicationsCriterion(taskTopicTitle, resolvedTaskShortName)
                || keywordMatchedTopicKey === "relevant-implications";
            const isRelevantDigiMedConventionsTopic = isDigitalOutcomeRelevantDigiMedConventionsCriterion(taskTopicTitle, resolvedTaskShortName)
                || keywordMatchedTopicKey === "relevant-digimed-conventions";
            const isUXPrinciplesTopic = isDigitalOutcomeUXPrinciplesCriterion(taskTopicTitle, resolvedTaskShortName)
                || keywordMatchedTopicKey === "user-experience-principles";

            const syncTemplateId = isUseOfToolsTechniquesTopic
                ? "use-of-tools-and-techniques"
                : isTargetAudienceTopic
                ? "target-audience"
                : (isTriallingComponentsTopic
                    ? "trialling-components"
                    : (isDevelopmentToolsTopic
                        ? "development-steps"
                        : (isSuccessCriteriaTopic
                            ? "project-success-criteria"
                            : (isRelevantImplicationsTopic
                                ? "relevant-implications"
                                : (isRelevantDigiMedConventionsTopic
                                    ? "relevant-digimed-conventions"
                                    : (isUXPrinciplesTopic ? "user-experience-principles" : "digital-outcome-description"))))));
            const syncTopicLabels = {
                "use-of-tools-and-techniques": USE_OF_TOOLS_TECHNIQUES_TEMPLATE_TITLE,
                "target-audience": DIGITAL_OUTCOME_TARGET_AUDIENCE_TITLE,
                "trialling-components": DIGITAL_OUTCOME_TRIALLING_COMPONENTS_TITLE,
                "development-steps": DIGITAL_OUTCOME_DEVELOPMENT_TOOLS_TITLE,
                "project-success-criteria": DIGITAL_OUTCOME_SUCCESS_CRITERIA_TITLE,
                "relevant-implications": DIGITAL_OUTCOME_RELEVANT_IMPLICATIONS_TITLE,
                "relevant-digimed-conventions": DIGITAL_OUTCOME_RELEVANT_DIGIMED_CONVENTIONS_TITLE,
                "user-experience-principles": DIGITAL_OUTCOME_UX_PRINCIPLES_TITLE,
                "digital-outcome-description": "Digital Outcome: Description"
            };
            const syncTopicLabel = syncTopicLabels[syncTemplateId] || "Digital Outcome: Description";

            await openDigitalOutcomeTaskTopicSyncModal(ctx.projectId, ctx.email, taskTopicTitle, resolvedTaskShortName, syncTemplateId, syncTopicLabel);
        });
    }

    const convertButtons = Array.from(host.querySelectorAll("button[data-convert-category]"));
    const reapplyColorButton = host.querySelector("#detail-reapply-category-color");
    if (convertButtons.length) {
        const setConvertDisabled = (disabled) => {
            convertButtons.forEach((button) => {
                button.disabled = disabled;
            });
            if (reapplyColorButton) {
                reapplyColorButton.disabled = disabled;
            }
        };

        convertButtons.forEach((button) => {
            button.addEventListener("click", async () => {
                const targetCategory = normalizeCardCategory(button.getAttribute("data-convert-category"), "Activity");
                const currentCategory = normalizeCardCategory(data?.activityCategory, "Activity");
                if (!targetCategory || targetCategory === currentCategory) {
                    return;
                }

                const confirmed = window.confirm(`Convert "${data.title}" to ${targetCategory}?`);
                if (!confirmed) {
                    return;
                }

                setConvertDisabled(true);
                if (editButton) editButton.disabled = true;
                if (deleteButton) deleteButton.disabled = true;

                try {
                    const draft = defaultDetailShape(id, data);
                    draft.activityCategory = targetCategory;
                    draft.cardColor = getDefaultCardColorForCategory(targetCategory);
                    const saved = await saveDetails(id, draft);
                    DETAIL_DATA[id] = saved;
                    renderDetailView(host, id, saved, canEdit, selectedTaskTopic, selectedTaskShortName);
                } catch (error) {
                    setConvertDisabled(false);
                    if (editButton) editButton.disabled = false;
                    if (deleteButton) deleteButton.disabled = false;
                    window.alert(error.message || "Could not convert this item category.");
                }
            });
        });

        if (reapplyColorButton) {
            reapplyColorButton.addEventListener("click", async () => {
                const currentCategory = normalizeCardCategory(data?.activityCategory, "Activity");
                const targetColor = getDefaultCardColorForCategory(currentCategory);
                const confirmed = window.confirm(`Reapply ${targetColor} color for category ${currentCategory}?`);
                if (!confirmed) {
                    return;
                }

                setConvertDisabled(true);
                if (editButton) editButton.disabled = true;
                if (deleteButton) deleteButton.disabled = true;

                try {
                    const draft = defaultDetailShape(id, data);
                    draft.activityCategory = currentCategory;
                    draft.cardColor = targetColor;
                    const saved = await saveDetails(id, draft);
                    DETAIL_DATA[id] = saved;
                    renderDetailView(host, id, saved, canEdit, selectedTaskTopic, selectedTaskShortName);
                } catch (error) {
                    setConvertDisabled(false);
                    if (editButton) editButton.disabled = false;
                    if (deleteButton) deleteButton.disabled = false;
                    window.alert(error.message || "Could not reapply category color.");
                }
            });
        }
    }
}

async function deleteDetails(id) {
    const response = await fetch(`/api/activities/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: buildWriteHeaders()
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || result.message || "Could not delete this activity/project.");
    }
}

async function saveDetails(id, draft) {
    const toArraySafe = (value) => {
        if (Array.isArray(value)) {
            return value.map((item) => String(item || "").trim()).filter(Boolean);
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (!trimmed) return [];
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map((item) => String(item || "").trim()).filter(Boolean);
                }
            } catch (_error) {
            }
            return trimmed
                .split(/\r?\n/)
                .map((item) => item.trim())
                .filter(Boolean);
        }
        return [];
    };

    const payload = {
        id,
        name: draft.title,
        year_level: draft.yearLevel,
        type: draft.type,
            activity_category: normalizeCardCategory(draft.activityCategory, "Activity"),
        card_color: String(draft.cardColor || "").trim(),
        duration_minutes: parseDurationMinutes(draft.durationMinutes),
        outcome_image_url: isGeneratedUploadedActivityImageUrl(draft.image) ? "" : draft.image,
        description: draft.summary,
        resources: draft.resources,
        equipment: draft.equipment,
        instructions: draft.instructions,
        card_url: draft.cardUrl,
        show_in_this_week: draft.showInThisWeek,
        term: draft.term,
        
        // Project Proposal Fields
        start_date: draft.startDate,
        contact_name: draft.contactName,
        contact_phone: draft.contactPhone,
        contact_email: draft.contactEmail,
        company: draft.company,
        address: draft.address,
        overview: draft.overview,
        services: draft.services,
        costs: draft.costs,
        outcomes: draft.outcomes,
        withdrawal_date: draft.withdrawalDate,
        client_id: draft.clientId,
        
        // Assessment Task Fields
        standard_details: draft.standardDetails,
        tasks_list: draft.tasksList,
        assessment_focus: draft.tasksList,
        achieved: draft.achieved,
        merit: draft.merit,
        excellence: draft.excellence,
        submission_requirements: draft.submissionRequirements,
        relevant_implications: draft.relevantImplications,
        progress_logging: draft.progressLogging,
        feedback_trialling: draft.feedbackTrialling
    };

    const response = await fetch("/api/activities", {
        method: "POST",
        headers: buildWriteHeaders(),
        body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.error || result.message || "Could not save changes.");
    }

    return {
        id: result.id || id,
        title: result.name || draft.title,
        yearLevel: result.year_level || draft.yearLevel,
        type: result.type || draft.type,
        duration: result.duration_minutes
            ? `${result.duration_minutes} mins`
            : `${parseDurationMinutes(draft.durationMinutes)} mins`,
        term: result.term || draft.term,
        activityCategory: normalizeCardCategory(result.activity_category || draft.activityCategory, "Activity"),
        cardColor: String(result.card_color || draft.cardColor || "").trim() || getDefaultCardColorForCategory(result.activity_category || draft.activityCategory),
        showInThisWeek: Boolean(result.show_in_this_week ?? result.show_this_week ?? result.is_pinned ?? result.is_this_week ?? draft.showInThisWeek),
        summary: String(result.description || result.summary || draft.summary || "").trim(),
        resources: Array.isArray(result.resources) ? result.resources : draft.resources,
        equipment: Array.isArray(result.equipment) ? result.equipment : draft.equipment,
        instructions: Array.isArray(result.instructions) ? result.instructions : draft.instructions,
        cardUrl: String(result.card_url || result.activity_url || result.url || draft.cardUrl || "").trim(),
        image: result.outcome_image_url || draft.image,
        
        // Project Proposal Fields
        startDate: result.start_date || draft.startDate,
        contactName: result.contact_name || draft.contactName,
        contactPhone: result.contact_phone || draft.contactPhone,
        contactEmail: result.contact_email || draft.contactEmail,
        company: result.company || draft.company,
        address: result.address || draft.address,
        overview: Array.isArray(result.overview) ? result.overview : draft.overview,
        services: Array.isArray(result.services) ? result.services : draft.services,
        costs: Array.isArray(result.costs) ? result.costs : draft.costs,
        outcomes: Array.isArray(result.outcomes) ? result.outcomes : draft.outcomes,
        withdrawalDate: result.withdrawal_date || draft.withdrawalDate,
        clientId: result.client_id || draft.clientId,

        // Assessment Task Fields
        standardDetails: Array.isArray(result.standard_details) ? result.standard_details : draft.standardDetails,
        tasksList: (() => {
            const fromTasksList = toArraySafe(result.tasks_list);
            if (fromTasksList.length) {
                return fromTasksList;
            }
            const fromAssessmentFocus = toArraySafe(result.assessment_focus);
            if (fromAssessmentFocus.length) {
                return fromAssessmentFocus;
            }
            return draft.tasksList;
        })(),
        achieved: Array.isArray(result.achieved) ? result.achieved : draft.achieved,
        merit: Array.isArray(result.merit) ? result.merit : draft.merit,
        excellence: Array.isArray(result.excellence) ? result.excellence : draft.excellence,
        submissionRequirements: Array.isArray(result.submission_requirements) ? result.submission_requirements : draft.submissionRequirements,
        relevantImplications: Array.isArray(result.relevant_implications) ? result.relevant_implications : draft.relevantImplications,
        progressLogging: Array.isArray(result.progress_logging) ? result.progress_logging : draft.progressLogging,
        feedbackTrialling: Array.isArray(result.feedback_trialling) ? result.feedback_trialling : draft.feedbackTrialling
    };
}

function replaceTaskTopicInLines(lines, previousTopic, nextTopic) {
    const source = Array.isArray(lines) ? lines : [];
    const previousNormalized = normalizeTaskTopicText(previousTopic).toLowerCase();
    const nextValue = String(nextTopic || "").trim();

    if (!previousNormalized || !nextValue) {
        return source;
    }

    return source.map((line) => {
        const text = String(line || "").trim();
        if (!text) {
            return text;
        }

        const levelMatch = text.match(/^(Achieved|Merit|Excellence)\s*:\s*(.*)$/i);
        const rawValue = levelMatch ? String(levelMatch[2] || "").trim() : text;
        const normalizedValue = normalizeTaskTopicText(rawValue).toLowerCase();
        if (normalizedValue !== previousNormalized) {
            return text;
        }

        if (levelMatch) {
            return `${levelMatch[1]}: ${nextValue}`;
        }

        return nextValue;
    });
}

function renderTaskTopicEditForm(host, id, data, canEdit, selectedTaskTopic, selectedTaskShortName = "") {
    const currentTopic = String(selectedTaskTopic || "").trim();
    const currentShortName = String(selectedTaskShortName || "").trim()
        || getTaskTopicShortNameOverride(id, currentTopic)
        || deriveTaskShortName(currentTopic);
    const standardTaskTopicUrl = toSafeExternalUrl(data?.cardUrl)
        || `${window.location.origin}/ProjectPages/custom-activity.html?id=${encodeURIComponent(String(id || ""))}`;
    const currentTemplateImageUrl = toSafeExternalUrl(data?.slideshowTemplateImage || data?.slideTemplateImage || "");
    const currentTemplateFileUrl = toSafeExternalUrl(data?.slideshowTemplateFileUrl || data?.slideTemplateFileUrl || data?.speakerNotesCriteriaUrl || "");
    const renderOptions = (options, selectedValue) => options
        .map((option) => {
            const safeOption = String(option || "").trim();
            const selected = safeOption === String(selectedValue || "").trim() ? " selected" : "";
            return `<option${selected}>${escapeHtml(safeOption)}</option>`;
        })
        .join("");

    const yearLevelOptions = ["Junior", "Middle", "Senior", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13"];
    const cardCategoryOptions = ["Activity", "Project", "Assessment Task", "Lesson", "Task Topic"];
    const subjectStreamOptions = ["DTECH", "COMP", "TEXT", "DTONLINE"];
    const topicTypeOptions = ["Office Suite", "Programming", "Electronics", "Digital Media", "Project Management", "Process"];
    const difficultyOptions = ["Beginner", "Intermediate", "Advanced"];

    const selectedYearLevel = "Senior";
    const selectedCardCategory = "Task Topic";
    const selectedSubjectStream = "DTECH";
    const selectedTopicType = "Process";
    const selectedDifficulty = "Intermediate";

    if (!currentTopic) {
        renderDetailView(host, id, data, canEdit, selectedTaskTopic);
        return;
    }

    const formId = `task-topic-edit-form-${id}`;
    host.innerHTML = `
        <header class="toolbar">
            <span class="toolbar-label">Edit Task Topic Card</span>
            <div class="toolbar-actions">
                <a href="../index.html">Back to Hub</a>
            </div>
        </header>

        <form id="${formId}" class="detail-form" novalidate>
            <fieldset class="detail-form-section">
                <legend>Card Basics</legend>
                <div class="detail-form-grid">
                    <label class="detail-field">
                        <span>Card Name</span>
                        <input name="taskTopicShortName" type="text" required value="${escapeHtml(currentShortName)}">
                    </label>
                    <label class="detail-field">
                        <span>Year Level</span>
                        <select name="taskTopicYearLevel">
                            ${renderOptions(yearLevelOptions, selectedYearLevel)}
                        </select>
                    </label>
                    <label class="detail-field">
                        <span>Card Category</span>
                        <select name="taskTopicCategory" disabled>
                            ${renderOptions(cardCategoryOptions, selectedCardCategory)}
                        </select>
                    </label>
                    <label class="detail-field">
                        <span>Subject Stream</span>
                        <select name="taskTopicSubject">
                            ${renderOptions(subjectStreamOptions, selectedSubjectStream)}
                        </select>
                    </label>
                    <label class="detail-field">
                        <span>Topic Type</span>
                        <select name="taskTopicType">
                            ${renderOptions(topicTypeOptions, selectedTopicType)}
                        </select>
                    </label>
                    <label class="detail-field">
                        <span>Difficulty</span>
                        <select name="taskTopicDifficulty">
                            ${renderOptions(difficultyOptions, selectedDifficulty)}
                        </select>
                    </label>
                    <label class="detail-field detail-field-full">
                        <span>Standard Details</span>
                        <div class="task-topic-standard-controls">
                            <select name="taskTopicStandardLibrary">
                                <option value="">Loading standards...</option>
                            </select>
                            <button type="button" class="detail-action detail-action-secondary" id="task-topic-standard-add">Add Standard</button>
                            <a class="detail-action detail-action-secondary" href="../admin-assessment-information.html" target="_blank" rel="noreferrer">Open Standards Manager</a>
                        </div>
                        <input name="taskTopicStandardDetails" type="hidden" value="">
                        <div class="task-topic-standard-list task-topic-standard-edit-list" id="task-topic-standard-chip-list"></div>
                    </label>
                    <label class="detail-field detail-field-full">
                        <span>Card URL</span>
                        <input name="taskTopicUrl" type="url" value="${escapeHtml(standardTaskTopicUrl)}" readonly>
                    </label>
                    <label class="detail-field detail-field-full">
                        <span>Slideshow Template Preview Image URL</span>
                        <input name="taskTopicTemplateImageUrl" type="url" placeholder="https://..." value="${escapeHtml(currentTemplateImageUrl)}">
                    </label>
                    <label class="detail-field detail-field-full">
                        <span>Slideshow Template File URL</span>
                        <input name="taskTopicTemplateFileUrl" type="url" placeholder="https://docs.google.com/presentation/..." value="${escapeHtml(currentTemplateFileUrl)}">
                    </label>
                    <label class="detail-field detail-field-full">
                        <span>Short Description</span>
                        <textarea name="taskTopicSummary" rows="4" required>${escapeHtml(currentTopic)}</textarea>
                    </label>
                </div>
            </fieldset>

            <fieldset class="detail-form-section">
                <legend>Display Options</legend>
                <div class="detail-form-grid">
                    <label class="detail-field detail-field-full">
                        <span>Card Colour</span>
                        <input name="taskTopicColor" type="text" value="Azure" readonly>
                    </label>
                    <label class="detail-field detail-field-full" style="display:flex;align-items:center;gap:8px;">
                        <input name="taskTopicTimeSensitive" type="checkbox" disabled>
                        <span style="margin:0;">Time Sensitive</span>
                    </label>
                    <label class="detail-field detail-field-full" style="display:flex;align-items:center;gap:8px;">
                        <input name="taskTopicShowThisWeek" type="checkbox" checked disabled>
                        <span style="margin:0;">Show In This Week Section</span>
                    </label>
                </div>
            </fieldset>

            <div class="detail-form-actions">
                <button type="submit" class="detail-action">Save Task Topic</button>
                <button type="button" class="detail-action detail-action-secondary" id="task-topic-edit-cancel">Cancel</button>
                <p class="detail-form-status" id="task-topic-edit-status" aria-live="polite"></p>
            </div>
        </form>
    `;

    const form = host.querySelector(`#${formId}`);
    const cancelButton = host.querySelector("#task-topic-edit-cancel");
    const statusElement = host.querySelector("#task-topic-edit-status");
    const standardSelect = host.querySelector("[name='taskTopicStandardLibrary']");
    const standardAddButton = host.querySelector("#task-topic-standard-add");
    const standardChipList = host.querySelector("#task-topic-standard-chip-list");
    const standardHiddenInput = host.querySelector("[name='taskTopicStandardDetails']");
    let standardLines = coerceArray(data?.standardDetails)
        .map((line) => String(line || "").trim())
        .filter(Boolean);

    const renderStandardChips = () => {
        if (!standardChipList || !standardHiddenInput) {
            return;
        }

        standardHiddenInput.value = standardLines.join("\n");
        if (!standardLines.length) {
            standardChipList.innerHTML = '<span class="task-topic-standard-empty">No standards selected yet.</span>';
            return;
        }

        standardChipList.innerHTML = standardLines
            .map((line, index) => `
                <span class="task-topic-standard-chip">
                    ${escapeHtml(line)}
                    <button type="button" class="task-topic-standard-remove" data-standard-remove-index="${index}">Remove</button>
                </span>
            `)
            .join("");
    };

    const loadStandardOptions = async () => {
        if (!standardSelect) {
            return;
        }

        standardSelect.innerHTML = '<option value="">Loading standards...</option>';
        standardSelect.disabled = true;
        if (standardAddButton) {
            standardAddButton.disabled = true;
        }

        try {
            const options = await getDetailStandardsOptions();
            if (!Array.isArray(options) || !options.length) {
                standardSelect.innerHTML = '<option value="">No standards available</option>';
                return;
            }

            standardSelect.innerHTML = [
                '<option value="">Select a standard...</option>',
                ...options.map((row) => {
                    const label = formatDetailStandardOption(row);
                    return `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`;
                })
            ].join("");
        } catch (_error) {
            standardSelect.innerHTML = '<option value="">Could not load standards</option>';
        } finally {
            standardSelect.disabled = false;
            if (standardAddButton) {
                standardAddButton.disabled = false;
            }
        }
    };

    renderStandardChips();
    void loadStandardOptions();

    cancelButton?.addEventListener("click", () => {
        renderDetailView(host, id, data, canEdit, selectedTaskTopic, currentShortName);
    });

    standardAddButton?.addEventListener("click", () => {
        const selected = String(standardSelect?.value || "").trim();
        if (!selected) {
            return;
        }

        if (!standardLines.includes(selected)) {
            standardLines.push(selected);
            renderStandardChips();
        }

        const achievedField = form?.querySelector('[name="achieved"]');
        const meritField = form?.querySelector('[name="merit"]');
        const excellenceField = form?.querySelector('[name="excellence"]');
        const statusEl = host.querySelector("#task-topic-edit-status");
        const setStatus = (message, isError = false) => {
            if (!statusEl) return;
            statusEl.textContent = message;
            statusEl.classList.toggle("is-error", Boolean(isError));
        };
        void tryAutofillDetailStandardCard(selected, {
            onApplied: (card) => applyDetailStandardCardTemplate(card, {
                achievedField,
                meritField,
                excellenceField,
                setStatusFn: setStatus
            })
        });
    });

    standardChipList?.addEventListener("click", (event) => {
        const target = event.target.closest("button[data-standard-remove-index]");
        if (!target) {
            return;
        }

        const index = Number.parseInt(target.getAttribute("data-standard-remove-index"), 10);
        if (!Number.isInteger(index) || index < 0 || index >= standardLines.length) {
            return;
        }

        standardLines.splice(index, 1);
        renderStandardChips();
    });

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const nextShortName = String(formData.get("taskTopicShortName") || "").trim();
        const nextTopic = normalizeTaskTopicText(formData.get("taskTopicSummary") || "");

        if (!nextShortName) {
            if (statusElement) {
                statusElement.textContent = "Task short name is required.";
                statusElement.classList.add("is-error");
            }
            return;
        }

        if (!nextTopic) {
            if (statusElement) {
                statusElement.textContent = "Task long name (Short Description) is required.";
                statusElement.classList.add("is-error");
            }
            return;
        }

        if (statusElement) {
            statusElement.textContent = "Saving...";
            statusElement.classList.remove("is-error");
        }

        const draft = {
            title: data.title,
            yearLevel: data.yearLevel,
            type: data.type,
            durationMinutes: parseDurationMinutes(data.duration),
            term: data.term,
            activityCategory: data.activityCategory,
            showInThisWeek: data.showInThisWeek,
            summary: data.summary,
            resources: coerceArray(data.resources),
            equipment: coerceArray(data.equipment),
            instructions: coerceArray(data.instructions),
            cardUrl: data.cardUrl,
            image: data.image,
            slideshowTemplateImage: toSafeExternalUrl(formData.get("taskTopicTemplateImageUrl")) || "",
            slideshowTemplateFileUrl: toSafeExternalUrl(formData.get("taskTopicTemplateFileUrl")) || "",
            startDate: data.startDate,
            contactName: data.contactName,
            contactPhone: data.contactPhone,
            contactEmail: data.contactEmail,
            company: data.company,
            address: data.address,
            overview: coerceArray(data.overview),
            services: coerceArray(data.services),
            costs: coerceArray(data.costs),
            outcomes: coerceArray(data.outcomes),
            withdrawalDate: data.withdrawalDate,
            clientId: data.clientId,
            standardDetails: standardLines,
            tasksList: replaceTaskTopicInLines(coerceArray(data.tasksList), currentTopic, nextTopic),
            achieved: replaceTaskTopicInLines(coerceArray(data.achieved), currentTopic, nextTopic),
            merit: replaceTaskTopicInLines(coerceArray(data.merit), currentTopic, nextTopic),
            excellence: replaceTaskTopicInLines(coerceArray(data.excellence), currentTopic, nextTopic),
            submissionRequirements: coerceArray(data.submissionRequirements),
            relevantImplications: coerceArray(data.relevantImplications),
            progressLogging: coerceArray(data.progressLogging),
            feedbackTrialling: coerceArray(data.feedbackTrialling)
        };

        try {
            const saved = await saveDetails(id, draft);
            setTaskTopicShortNameOverride(id, currentTopic, "");
            setTaskTopicShortNameOverride(id, nextTopic, nextShortName);
            if (statusElement) {
                statusElement.textContent = "Saved.";
                statusElement.classList.remove("is-error");
            }
            renderDetailView(host, id, saved, canEdit, nextTopic, nextShortName);
        } catch (error) {
            if (statusElement) {
                statusElement.textContent = error.message || "Could not save task topic.";
                statusElement.classList.add("is-error");
            }
        }
    });
}

function renderEditForm(host, id, data) {
    const formId = `detail-edit-form-${id}`;
    const normalizedCategory = normalizeCardCategory(data.activityCategory, "Activity");
    const isProjectCategory = normalizedCategory === "Project";
    const editorLabel = isProjectCategory ? "Project" : (normalizedCategory || "Activity");
    const basicsLegend = isProjectCategory ? "Project Basics" : "Activity Basics";

    host.innerHTML = `
        <header class="toolbar">
            <span class="toolbar-label">Edit ${escapeHtml(editorLabel)}</span>
            <div class="toolbar-actions">
                <a href="../index.html">Back to Hub</a>
            </div>
        </header>

        <form id="${formId}" class="detail-form" novalidate>
            <fieldset class="detail-form-section">
                <legend>${escapeHtml(basicsLegend)}</legend>
                <div class="detail-form-grid">
                    <label class="detail-field">
                        <span>Title</span>
                        <input name="title" type="text" required value="${escapeHtml(data.title)}">
                    </label>
                    <label class="detail-field">
                        <span>Start Date</span>
                        <input name="startDate" type="date" value="${escapeHtml(data.startDate)}">
                    </label>
                    <label class="detail-field">
                        <span>Year Level</span>
                        <input name="yearLevel" type="text" required value="${escapeHtml(data.yearLevel)}">
                    </label>
                    <label class="detail-field">
                        <span>Type</span>
                        <input name="type" type="text" required value="${escapeHtml(data.type)}">
                    </label>
                    <label class="detail-field">
                        <span>Duration (minutes)</span>
                        <input name="durationMinutes" type="number" min="1" step="1" required value="${parseDurationMinutes(data.duration)}">
                    </label>
                    <label class="detail-field">
                        <span>Activity Category</span>
                        <select name="activityCategory">
                            <option${normalizeCardCategory(data.activityCategory, "Activity") === "Activity" ? " selected" : ""}>Activity</option>
                            <option${normalizeCardCategory(data.activityCategory, "Activity") === "Project" ? " selected" : ""}>Project</option>
                            <option${normalizeCardCategory(data.activityCategory, "Activity") === "Assessment Task" ? " selected" : ""}>Assessment Task</option>
                            <option${normalizeCardCategory(data.activityCategory, "Activity") === "Lesson" ? " selected" : ""}>Lesson</option>
                        </select>
                    </label>
                </div>
            </fieldset>

            <fieldset class="detail-form-section">
                <legend>Client's Contact Information</legend>
                <div class="detail-form-grid">
                    <label class="detail-field">
                        <span>Contact Name</span>
                        <input name="contactName" type="text" value="${escapeHtml(data.contactName)}">
                    </label>
                    <label class="detail-field">
                        <span>Phone</span>
                        <input name="contactPhone" type="tel" value="${escapeHtml(data.contactPhone)}">
                    </label>
                    <label class="detail-field">
                        <span>Email</span>
                        <input name="contactEmail" type="email" value="${escapeHtml(data.contactEmail)}">
                    </label>
                    <label class="detail-field">
                        <span>Company</span>
                        <input name="company" type="text" value="${escapeHtml(data.company)}">
                    </label>
                    <label class="detail-field">
                        <span>Address</span>
                        <input name="address" type="text" value="${escapeHtml(data.address)}">
                    </label>
                </div>
            </fieldset>

            <label class="detail-field detail-field-full">
                <span>Summary</span>
                <textarea name="summary" rows="4">${escapeHtml(data.summary)}</textarea>
            </label>

            <fieldset class="detail-form-section">
                <legend>Tasks & Assessment</legend>
                <label class="detail-field detail-field-full">
                    <span>Standard Details (one per line)</span>
                    <div class="practical-inline-manage" style="margin-bottom: 8px;">
                        <select name="standardLibraryOption" style="min-width: 260px;">
                            <option value="">Loading standards...</option>
                        </select>
                        <button type="button" class="detail-action detail-action-secondary" data-add-standard-line>Add Standard</button>
                    </div>
                    <div class="standard-chip-list" data-standard-chip-list aria-live="polite"></div>
                    <textarea name="standardDetails" class="standard-details-storage" aria-hidden="true" tabindex="-1" rows="4">${escapeHtml(asLines(data.standardDetails))}</textarea>
                </label>
                <label class="detail-field detail-field-full">
                    <span>Tasks List (one per line)</span>
                    <textarea name="tasksList" rows="6">${escapeHtml(asLines(data.tasksList))}</textarea>
                </label>
                <label class="detail-field detail-field-full">
                    <span>Achieved (one per line)</span>
                    <textarea name="achieved" rows="4">${escapeHtml(asLines(data.achieved))}</textarea>
                </label>
                <label class="detail-field detail-field-full">
                    <span>Merit (one per line)</span>
                    <textarea name="merit" rows="4">${escapeHtml(asLines(data.merit))}</textarea>
                </label>
                <label class="detail-field detail-field-full">
                    <span>Excellence (one per line)</span>
                    <textarea name="excellence" rows="4">${escapeHtml(asLines(data.excellence))}</textarea>
                </label>
            </fieldset>

            <fieldset class="detail-form-section">
                <legend>Proposal Content</legend>
                <label class="detail-field detail-field-full">
                    <span>Overview and Needs (one per line)</span>
                    <textarea name="overview" rows="6">${escapeHtml(asLines(data.overview))}</textarea>
                </label>
                <label class="detail-field detail-field-full">
                    <span>Services Provided (one per line)</span>
                    <textarea name="services" rows="6">${escapeHtml(asLines(data.services))}</textarea>
                </label>
                <label class="detail-field detail-field-full">
                    <span>Estimated Costs (one per line)</span>
                    <textarea name="costs" rows="6">${escapeHtml(asLines(data.costs))}</textarea>
                </label>
                <label class="detail-field detail-field-full">
                    <span>Positive Outcomes (one per line)</span>
                    <textarea name="outcomes" rows="6">${escapeHtml(asLines(data.outcomes))}</textarea>
                </label>
            </fieldset>

            <fieldset class="detail-form-section">
                <legend>Proposal Terms</legend>
                <label class="detail-field">
                    <span>Withdrawal Date</span>
                    <input name="withdrawalDate" type="date" value="${escapeHtml(data.withdrawalDate)}">
                </label>
                <label class="detail-field detail-field-full">
                    <span>Client ID / Details</span>
                    <input name="clientId" type="text" value="${escapeHtml(data.clientId)}">
                </label>
            </fieldset>

            <label class="detail-field detail-field-full">
                <span>Image URL</span>
                <input name="image" type="url" value="${escapeHtml(data.image)}">
            </label>

            <div class="detail-form-grid">
                <label class="detail-field detail-field-full">
                    <span>Resources (one per line)</span>
                    <textarea name="resources" rows="4">${escapeHtml(asLines(data.resources))}</textarea>
                </label>
                <label class="detail-field detail-field-full">
                    <span>Equipment (one per line)</span>
                    <textarea name="equipment" rows="4">${escapeHtml(asLines(data.equipment))}</textarea>
                </label>
                <label class="detail-field detail-field-full">
                    <span>Instructions (one per line)</span>
                    <textarea name="instructions" rows="4">${escapeHtml(asLines(data.instructions))}</textarea>
                </label>
            </div>

            <label class="detail-checkbox">
                <input name="showInThisWeek" type="checkbox" ${data.showInThisWeek ? "checked" : ""}>
                <span>Show in This Week</span>
            </label>

            <div class="detail-form-actions">
                <button type="submit" class="detail-action">Save Changes</button>
                <button type="button" class="detail-action detail-action-secondary" id="detail-cancel">Cancel</button>
            </div>
            <p class="detail-status" id="detail-status" aria-live="polite"></p>
        </form>
    `;

    const form = host.querySelector(`#${formId}`);
    const status = host.querySelector("#detail-status");
    const cancelButton = host.querySelector("#detail-cancel");

    const setStatus = (message, isError = false) => {
        if (!status) return;
        status.textContent = message;
        status.classList.toggle("is-error", isError);
    };

    if (cancelButton) {
        cancelButton.addEventListener("click", async () => {
            const latestShared = await readSharedActivity(id);
            const fallback = defaultDetailShape(id, data);
            const nextData = defaultDetailShape(id, latestShared || DETAIL_DATA[id] || fallback);
            renderDetailView(host, id, nextData, true);
        });
    }

    if (!form) return;

    setupDetailStandardsPicker(form, setStatus);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const draft = {
            title: String(formData.get("title") || "").trim(),
            yearLevel: String(formData.get("yearLevel") || "").trim(),
            type: String(formData.get("type") || "").trim(),
            durationMinutes: String(formData.get("durationMinutes") || "").trim(),
            term: String(formData.get("term") || "").trim() || "Term 2",
            activityCategory: normalizeCardCategory(formData.get("activityCategory"), data?.activityCategory || "Assessment Task"),
            summary: String(formData.get("summary") || "").trim(),
            image: String(formData.get("image") || "").trim() || "https://placehold.co/900x560/3f89cf/ffffff?text=Uploaded+Activity",
            slideshowTemplateImage: toSafeExternalUrl(data?.slideshowTemplateImage || data?.slideTemplateImage || ""),
            slideshowTemplateFileUrl: toSafeExternalUrl(data?.slideshowTemplateFileUrl || data?.slideTemplateFileUrl || data?.speakerNotesCriteriaUrl || ""),
            resources: parseLines(formData.get("resources")),
            equipment: parseLines(formData.get("equipment")),
            instructions: parseLines(formData.get("instructions")),
            showInThisWeek: formData.get("showInThisWeek") === "on",
            
            // Project Proposal Fields
            startDate: String(formData.get("startDate") || "").trim(),
            contactName: String(formData.get("contactName") || "").trim(),
            contactPhone: String(formData.get("contactPhone") || "").trim(),
            contactEmail: String(formData.get("contactEmail") || "").trim(),
            company: String(formData.get("company") || "").trim(),
            address: String(formData.get("address") || "").trim(),
            overview: parseLines(formData.get("overview")),
            services: parseLines(formData.get("services")),
            costs: parseLines(formData.get("costs")),
            outcomes: parseLines(formData.get("outcomes")),
            withdrawalDate: String(formData.get("withdrawalDate") || "").trim(),
            clientId: String(formData.get("clientId") || "").trim(),
            
            // Assessment Task Fields
            standardDetails: parseLines(formData.get("standardDetails")),
            tasksList: parseLines(formData.get("tasksList")),
            achieved: parseRequirementLines(formData.get("achieved")),
            merit: parseRequirementLines(formData.get("merit")),
            excellence: parseRequirementLines(formData.get("excellence")),
            submissionRequirements: parseLines(formData.get("submissionRequirements")),
            relevantImplications: parseLines(formData.get("relevantImplications")),
            progressLogging: parseLines(formData.get("progressLogging")),
            feedbackTrialling: parseLines(formData.get("feedbackTrialling"))
        };

        if (!draft.title || !draft.yearLevel || !draft.type) {
            setStatus("Title, year level, and type are required.", true);
            return;
        }

        try {
            setStatus("Saving changes...");
            const saved = await saveDetails(id, draft);
            DETAIL_DATA[id] = saved;
            setStatus("Saved.");
            renderDetailView(host, id, saved, true);
        } catch (error) {
            setStatus(error.message || "Could not save changes.", true);
        }
    });
}

async function initDetail() {
    if (!hasDetailPageAccess()) {
        window.location.replace("../index.html");
        return;
    }

    const root = document.querySelector("[data-activity-id]");
    const queryRoot = document.querySelector(".page");
    const host = root || queryRoot;
    if (!host) return;

    const params = new URLSearchParams(window.location.search);
    const id = host.getAttribute("data-activity-id") || params.get("id");
    const data = DETAIL_DATA[id] || await readSharedActivity(id);
    if (!data) return;

    const resolvedData = defaultDetailShape(id, data);
    const selectedTaskTopic = resolveRequestedTaskTopic(resolvedData, params);
    const selectedTaskShortName = String(params.get("taskShortName") || "").trim()
        || getTaskTopicShortNameOverride(id, selectedTaskTopic);
    const templateTopicText = String(selectedTaskShortName || selectedTaskTopic || "").trim();
    const teacherTemplateId = /^development\s+steps$/i.test(templateTopicText)
        ? "development-steps"
        : (/success\s+criteria|project\s+success\s+criteria/i.test(templateTopicText)
            ? "project-success-criteria"
            : (/triall?ing\s+components|trailing\s+components|trailing\s+comonents/i.test(templateTopicText)
            ? "trialling-components"
            : (/relevant.*conventions/i.test(templateTopicText)
            ? "relevant-digimed-conventions"
            : (/markup\s+validation|code\s+validation/i.test(templateTopicText)
            ? "testing-functions-markup-validation"
            : (/testing\s+functions|test(?:ing)?\s+that\s+the\s+digital\s+technologies\s+outcome\s+functions/i.test(templateTopicText)
            ? "testing-functions"
            : "")))));
    const teacherTemplate = teacherTemplateId
        ? await fetchTeacherTemplateLibraryEntry(teacherTemplateId)
        : null;
    const teacherTemplatePreview = !teacherTemplate && teacherTemplateId
        ? await fetchTemplateLibraryPreviewByTemplateId(teacherTemplateId)
        : "";
    const pageData = teacherTemplate
        ? {
            ...resolvedData,
            slideshowTemplateFileUrl: String(teacherTemplate.templateUrl || "").trim(),
            slideshowTemplateImage: String(teacherTemplate.imageUrl || "").trim()
                || toGoogleSlidesThumbnailUrl(teacherTemplate.templateUrl || "")
        }
        : teacherTemplatePreview
            ? { ...resolvedData, slideshowTemplateImage: teacherTemplatePreview }
            : resolvedData;
    const titleOverride = isDigitalOutcomeDescriptionCriterion(selectedTaskTopic, selectedTaskShortName)
        ? DIGITAL_OUTCOME_DESCRIPTION_TITLE
        : "";
    const canEditRole = await canEditDetails();
    const isTeacher = resolveDetailTeacherMode(canEditRole);

    document.title = `${titleOverride || selectedTaskShortName || selectedTaskTopic || pageData.title} | Computer Lab`;

    // In student view mode, teachers should see the same page experience as students.
    renderDetailView(host, id, pageData, isTeacher, selectedTaskTopic, selectedTaskShortName);

    // Load interest section only for backend-stored items (numeric IDs)
    if (String(id).match(/^\d+$/)) {
        await loadAndRenderInterestSection(host, id, isTeacher, pageData);
    }
}

async function loadAndRenderInterestSection(host, projectId, isTeacher, detailData) {
    installCloudSyncDelegatedFallbackHandlers();

    const existingSection = host.querySelector("#interest-section");
    if (existingSection) {
        existingSection.remove();
    }

    const email = readStoredHubEmail();
    const isAssessmentTask = String(detailData?.activityCategory || "").toLowerCase().includes("assessment");
    const isClientProjectsAssessment = isAssessmentTask && (
        String(projectId || "").trim() === "49"
        || String(detailData?.title || "").toLowerCase().includes("client project")
    );

    const fetchHeaders = buildAuthHeaders({});

    let interestData = { count: 0, my_interest: false, emails: [], confirmed: [], my_allocation: null };
    try {
        const resp = await fetch(`/api/activities/${encodeURIComponent(projectId)}/interests`, { headers: fetchHeaders });
        if (resp.ok) interestData = await resp.json();
    } catch (_err) {}

    const currentMediaType = String(interestData?.my_allocation?.digital_media_type || "").trim().toLowerCase();
    if (currentMediaType === "image") {
        const conventionsTable = host.querySelector("#digimed-conventions-table");
        if (conventionsTable) {
            conventionsTable.outerHTML = buildDigiMedImageConventionsTable(projectId, email);
            bindDigiMedImageConventionAcknowledgements(host, projectId, email);
        }
    }

    const section = document.createElement("section");
    section.className = "proposal-section interest-section";
    section.id = "interest-section";

    const countText = interestData.count === 0
        ? "No students have registered interest yet."
        : interestData.count === 1
            ? `1 student is interested in this ${isAssessmentTask ? "task" : "project"}.`
            : `${interestData.count} students are interested in this ${isAssessmentTask ? "task" : "project"}.`;

    let html = `<h2>Student Interest</h2><p class="interest-count" id="interest-count-text">${countText}</p>`;

    const selectedTaskTopic = String(new URLSearchParams(window.location.search || "").get("taskTopic") || "").trim();
    const selectedTaskShortName = String(new URLSearchParams(window.location.search || "").get("taskShortName") || "").trim();
    const taskTopicValue = String(selectedTaskTopic || "").trim();
    const myAllocation = interestData?.my_allocation || null;
    const isTaskTopicPage = Boolean(selectedTaskTopic);
    const isProjectManagementTaskTopicPage = isTaskTopicPage
        && selectedTaskTopic.toLowerCase().includes("project management");
    const isGithubTaskTopicPage = isTaskTopicPage
        && /github|version\s+control/i.test(`${selectedTaskTopic} ${selectedTaskShortName}`);
    const isTestingFunctionsTaskTopicPage = isDigitalOutcomeTestingFunctionsCriterion(
        selectedTaskTopic || detailData?.title,
        selectedTaskShortName
    );
    const isDevelopmentStepsTaskTopicPage = isTaskTopicPage
        && isDigitalOutcomeDevelopmentToolsCriterion(selectedTaskTopic, selectedTaskShortName);
    const isCodeValidationTaskTopicPage = isTaskTopicPage
        && isCodeValidationCriterion(selectedTaskTopic, selectedTaskShortName);
    const taskTopicContextSignals = [
        selectedTaskTopic,
        String(detailData?.subjectStream || detailData?.subject_stream || detailData?.subject || ""),
        String(detailData?.type || ""),
        String(detailData?.title || "")
    ].join(" ").toUpperCase();
    const isProgrammingTaskContext = /(DTECH|PROGRAMM|CODING|COMPUT|SOFTWARE|WEB|APP|PYTHON|JAVASCRIPT|ROBOTIC)/i.test(taskTopicContextSignals);
    const showGithubGuide = isProjectManagementTaskTopicPage || isGithubTaskTopicPage;

    if (isTeacher && isAssessmentTask && !isTaskTopicPage) {
        const students = Array.isArray(interestData?.students) ? interestData.students : [];
        const todayNz = getNzDateKey();
        const summaryStatuses = students.map((student) => summarizeStudentSubmissionStatus(student?.evidence_steps, todayNz));
        const acknowledgedCount = summaryStatuses.filter((status) => status.acknowledged).length;
        const loggedTodayCount = summaryStatuses.filter((status) => status.loggedToday).length;
        const trelloLinkedCount = summaryStatuses.filter((status) => status.trelloLinked).length;
        const hasProjectManagementTopic = [
            ...coerceArray(detailData?.tasksList),
            ...coerceArray(detailData?.assessmentFocus ?? detailData?.assessment_focus ?? detailData?.assessmentFocusRaw)
        ].some((line) => String(line || "").toLowerCase().includes("project management"));

        html += `
            <div class="task-topic-submission-teacher-panel assessment-submission-summary-panel">
                <h3>Evidence Progress</h3>
                <p class="task-topic-submission-note">Students connect evidence links (for example Google Slides) through DTECH HUB. This panel tracks connected evidence progress.</p>
                <div class="task-topic-submission-meta">
                    <p><strong>Evidence recorded:</strong> ${acknowledgedCount} of ${students.length}</p>
                    <p><strong>Logged today:</strong> ${loggedTodayCount} of ${students.length}</p>
                    ${hasProjectManagementTopic ? `<p><strong>Trello linked:</strong> ${trelloLinkedCount} of ${students.length}</p>` : ""}
                </div>
                ${isClientProjectsAssessment ? `
                <div class="task-topic-drive-links" style="margin-top:8px;">
                    <button type="button" class="detail-action detail-action-secondary" id="client-projects-backfill-btn">Run Client Projects Backfill Now</button>
                </div>
                <p class="interest-assign-status" id="client-projects-backfill-status" aria-live="polite"></p>
                ` : ""}
            </div>
        `;
    }

    if (isTeacher && isAssessmentTask) {
        const domainHint = detailAllowedDomain ? ` (${escapeHtml(detailAllowedDomain)} domain)` : "";
        html += `
            <form class="interest-assign-form" id="interest-assign-form" novalidate>
                <label for="interest-assign-email" class="interest-assign-label">Allocate student by email${domainHint}</label>
                <div class="interest-assign-row">
                    <input id="interest-assign-email" name="studentEmail" type="email" class="interest-assign-input" placeholder="student@westlandhigh.school.nz" required>
                    <button type="submit" class="detail-action interest-assign-btn">Add Student</button>
                </div>
                <p class="interest-assign-status" id="interest-assign-status" aria-live="polite"></p>
            </form>
        `;
    }

    // Signed-in non-teacher students see the toggle button
    if (email && !isTeacher) {
        const showStudentInterestToggle = !(isAssessmentTask && isTaskTopicPage);
        if (showStudentInterestToggle) {
            const btnClass = interestData.my_interest ? "detail-action interest-btn is-interested" : "detail-action interest-btn";
            const btnText = interestData.my_interest ? "\u2713 I'm Interested" : "I'm Interested";
            html += `<button type="button" class="${btnClass}" id="interest-toggle-btn">${btnText}</button>`;
        }
    }

    // Teachers see the full list of interested students
    if (isTeacher && interestData.emails.length > 0) {
        const studentsByEmail = new Map((Array.isArray(interestData.students) ? interestData.students : [])
            .map((student) => [String(student?.email || "").toLowerCase(), student]));
        const trelloConnectionByEmail = new Map();
        try {
            const emails = interestData.emails
                .map((studentEmail) => String(studentEmail || "").trim().toLowerCase())
                .filter(Boolean);
            if (emails.length) {
                const response = await fetch(`/api/integrations/trello/connections?emails=${encodeURIComponent(emails.join(","))}`, {
                    headers: buildWriteHeaders()
                });
                if (response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    const rows = Array.isArray(payload?.connections) ? payload.connections : [];
                    rows.forEach((row) => {
                        const normalizedEmail = String(row?.email || "").trim().toLowerCase();
                        if (!normalizedEmail) {
                            return;
                        }
                        trelloConnectionByEmail.set(normalizedEmail, Boolean(row?.connected));
                    });
                }
            }
        } catch (_error) {
            // Keep table rendering even if Trello status cannot be loaded.
        }

        html += `<div class="interest-student-list"><h3>Interested Students</h3>`;
        html += `<table class="interest-table"><thead><tr><th>Student Email</th><th>Project(s)</th><th>Status</th><th>Trello</th><th>OneDrive</th><th>Google Drive</th><th>GitHub</th><th>Action</th></tr></thead><tbody>`;
        for (const studentEmail of interestData.emails) {
            const isConfirmed = interestData.confirmed.includes(studentEmail);
            const statusBadge = isConfirmed
                ? `<span class="interest-status interest-confirmed">Confirmed</span>`
                : `<span class="interest-status interest-pending">Pending</span>`;
            const confirmBtnText = isConfirmed ? "Unconfirm" : "Confirm";

            const studentRecord = studentsByEmail.get(String(studentEmail || "").toLowerCase()) || null;
            const sourceProjects = Array.isArray(studentRecord?.source_projects)
                ? studentRecord.source_projects.map((name) => String(name || "").trim()).filter(Boolean)
                : [];
            const sourceProjectsHtml = sourceProjects.length
                ? sourceProjects.map((name) => `<span class="interest-project-chip">${escapeHtml(name)}</span>`).join("")
                : `<span class="interest-project-empty">-</span>`;
            const assignedStandards = getEffectiveAssignedStandards(studentRecord, detailData);
            const completionPercent = getEvidenceCompletionPercentFromRows(studentRecord?.evidence_steps, assignedStandards);
            const trelloCardUrl = getFirstTrelloCardUrlFromEvidenceRows(studentRecord?.evidence_steps);
            const oneDriveFolderUrl = getFirstOneDriveFolderUrlFromEvidenceRows(studentRecord?.evidence_steps);
            const googleDriveFolderUrl = getFirstGoogleDriveFolderUrlFromEvidenceRows(studentRecord?.evidence_steps);
            const githubRepoUrl = getFirstGithubRepoUrlFromEvidenceRows(studentRecord?.evidence_steps);
            const trelloConnected = Boolean(trelloConnectionByEmail.get(String(studentEmail || "").trim().toLowerCase()));
            const trelloStatusHtml = trelloCardUrl
                ? `<a class="interest-status interest-confirmed" href="${escapeHtml(trelloCardUrl)}" target="_blank" rel="noreferrer">Open Trello</a>`
                : (trelloConnected
                    ? `<span class="interest-status interest-confirmed">Connected</span>`
                    : `<span class="interest-status interest-pending">Not linked</span>`
                );
            const oneDriveStatusHtml = oneDriveFolderUrl
                ? `<a class="interest-status interest-confirmed" href="${escapeHtml(oneDriveFolderUrl)}" target="_blank" rel="noreferrer">Open OneDrive</a>`
                : `<span class="interest-status interest-pending">Not linked</span>`;
            const googleDriveStatusHtml = googleDriveFolderUrl
                ? `<a class="interest-status interest-confirmed" href="${escapeHtml(googleDriveFolderUrl)}" target="_blank" rel="noreferrer">Open Google Drive</a>`
                : `<span class="interest-status interest-pending">Not linked</span>`;
            const githubStatusHtml = githubRepoUrl
                ? `<a class="interest-status interest-confirmed" href="${escapeHtml(githubRepoUrl)}" target="_blank" rel="noreferrer">Open GitHub</a>`
                : `<span class="interest-status interest-pending">Not linked</span>`;
            const progressButton = assignedStandards.length
                ? `<button type="button" class="detail-action detail-action-secondary interest-progress-btn" data-student-email="${escapeHtml(studentEmail)}" data-standards="${escapeHtml(assignedStandards.join(","))}">Progress to Achieved Requirements ${completionPercent}%</button>`
                : "";

            html += `<tr data-student="${escapeHtml(studentEmail)}"><td>${escapeHtml(studentEmail)}</td><td class="interest-projects-cell">${sourceProjectsHtml}</td><td>${statusBadge}</td><td class="interest-trello-status-cell" data-student-email="${escapeHtml(studentEmail)}" data-trello-url="${escapeHtml(trelloCardUrl || "")}">${trelloStatusHtml}</td><td>${oneDriveStatusHtml}</td><td>${googleDriveStatusHtml}</td><td>${githubStatusHtml}</td><td><div class="interest-action-group"><button type="button" class="detail-action interest-confirm-btn" data-confirmed="${isConfirmed}">${confirmBtnText}</button>${progressButton}</div></td></tr>`;
        }
        html += `</tbody></table></div>`;
    } else if (isTeacher && interestData.count === 0) {
        html += `<p class="interest-no-students">No students have registered interest yet.</p>`;
    }

    section.innerHTML = html;
    host.appendChild(section);

    if (email && !isTeacher && isDevelopmentStepsTaskTopicPage) {
        try {
            const allocationResponse = await fetch("/api/my-allocations", { headers: buildWriteHeaders() });
            const allocationPayload = allocationResponse.ok ? await allocationResponse.json() : {};
            const allocations = [
                ...(Array.isArray(allocationPayload?.assessment_tasks) ? allocationPayload.assessment_tasks : []),
                ...(Array.isArray(allocationPayload?.projects) ? allocationPayload.projects : [])
            ];
            const processAllocation = allocations.find((allocation) => String(allocation?.id || "") === String(projectId)) || interestData?.my_allocation || {};
            const digitalMediaType = String(processAllocation?.digital_media_type || "").trim();
            const processStandard = String(processAllocation?.standard_1 || "").trim() || "Not set";
            const projectTaskStandard = String(processAllocation?.standard_2 || "").trim() || "Not set";
            const strand = String(processAllocation?.course_type || "").trim() || "Not set";
            const detailsSection = document.createElement("section");
            detailsSection.className = "proposal-section interest-section";
            detailsSection.id = "development-steps-student-details";
            detailsSection.innerHTML = `
                <h2>Student Details</h2>
                <p class="interest-count"><strong>Process Std:</strong> ${escapeHtml(processStandard)} &nbsp; <strong>Project/Task Std:</strong> ${escapeHtml(projectTaskStandard)} &nbsp; <strong>Strand:</strong> ${escapeHtml(strand)}${digitalMediaType ? ` &nbsp; <strong>Digital Media:</strong> ${escapeHtml(digitalMediaType)}` : ""}</p>
            `;
            section.insertAdjacentElement("afterend", detailsSection);

            if (digitalMediaType.toLowerCase() === "video") {
                const checks = readDigiMedVideoProductionProgress(projectId, email);
                const trackerSection = document.createElement("section");
                trackerSection.className = "proposal-section interest-section";
                trackerSection.id = "development-steps-video-tracker";
                trackerSection.innerHTML = `
                    <h2>Tracker (VIDEO)</h2>
                    ${Object.entries(DIGIMED_VIDEO_PRODUCTION_PROGRESS).map(([stage, items]) => `
                        <section class="task-topic-guide-block">
                            <h3>${escapeHtml(stage)}</h3>
                            <div class="task-list-decomposition-subtask-list">
                                ${items.map((item) => `<label class="task-list-decomposition-subtask ${checks[item] ? "is-complete" : ""}"><input type="checkbox" data-video-production-progress="${escapeHtml(item)}" ${checks[item] ? "checked" : ""}><span>${escapeHtml(item)}</span></label>`).join("")}
                            </div>
                        </section>
                    `).join("")}
                `;
                detailsSection.insertAdjacentElement("afterend", trackerSection);
                trackerSection.querySelectorAll("[data-video-production-progress]").forEach((checkbox) => {
                    checkbox.addEventListener("change", () => {
                        const item = String(checkbox.getAttribute("data-video-production-progress") || "").trim();
                        if (!item) return;
                        checks[item] = Boolean(checkbox.checked);
                        writeDigiMedVideoProductionProgress(projectId, email, checks);
                        checkbox.closest(".task-list-decomposition-subtask")?.classList.toggle("is-complete", Boolean(checkbox.checked));
                    });
                });
            } else if (digitalMediaType.toLowerCase() === "web") {
                const checks = readDigiMedWebProductionProgress(projectId, email);
                const trackerSection = document.createElement("section");
                trackerSection.className = "proposal-section interest-section";
                trackerSection.id = "development-steps-web-tracker";
                trackerSection.innerHTML = `
                    <h2>Tracker (WEB)</h2>
                    ${Object.entries(DIGIMED_WEB_PRODUCTION_PROGRESS).map(([stage, items]) => `
                        <section class="task-topic-guide-block">
                            <h3>${escapeHtml(stage)}</h3>
                            <div class="task-list-decomposition-subtask-list">
                                ${items.map((item) => `<label class="task-list-decomposition-subtask ${checks[item] ? "is-complete" : ""}"><input type="checkbox" data-web-production-progress="${escapeHtml(item)}" ${checks[item] ? "checked" : ""}><span>${escapeHtml(item)}</span></label>`).join("")}
                            </div>
                        </section>
                    `).join("")}
                `;
                detailsSection.insertAdjacentElement("afterend", trackerSection);
                trackerSection.querySelectorAll("[data-web-production-progress]").forEach((checkbox) => {
                    checkbox.addEventListener("change", () => {
                        const item = String(checkbox.getAttribute("data-web-production-progress") || "").trim();
                        if (!item) return;
                        checks[item] = Boolean(checkbox.checked);
                        writeDigiMedWebProductionProgress(projectId, email, checks);
                        checkbox.closest(".task-list-decomposition-subtask")?.classList.toggle("is-complete", Boolean(checkbox.checked));
                    });
                });
            }
        } catch (_error) {
            // The existing Student Interest section remains available if allocation details cannot be loaded.
        }
    }

    if (email && !isTeacher && isTaskTopicPage) {
        const assignedStandards = getEffectiveAssignedStandards(myAllocation, detailData);
        const completionPercent = getEvidenceCompletionPercentFromRows(myAllocation?.evidence_steps, assignedStandards);
        const templateLibraryProcessAssessmentUrl = isProjectManagementTaskTopicPage
            ? await ensureStudentProcessAssessmentFolderLink(
                projectId,
                email,
                detailData,
                taskTopicValue,
                myAllocation?.evidence_steps
            )
            : "";

        if (isProjectManagementTaskTopicPage || isGithubTaskTopicPage) {
            const sharedTrelloCardLink = getFirstTrelloCardUrlFromEvidenceRows(myAllocation?.evidence_steps);
            const sharedTrelloCardLinks = getAllTrelloCardUrlsFromEvidenceRows(myAllocation?.evidence_steps);
            const localTrelloCardLink = readStoredTrelloCardLink(projectId, email);
            const localTrelloCardLibrary = readStoredTrelloCardLibrary(projectId, email);
            const mergedTrelloCardLibrary = writeStoredTrelloCardLibrary(
                projectId,
                email,
                mergeTrelloCardLibrarySources(
                    [{ url: sharedTrelloCardLink, savedAt: "" }, { url: localTrelloCardLink, savedAt: "" }],
                    sharedTrelloCardLinks.map((url) => ({ url, savedAt: "" })),
                    localTrelloCardLibrary
                )
            );
            const savedCardLink = escapeHtml(sharedTrelloCardLink || localTrelloCardLink);
            const trelloBoardHint = getTrelloBoardHint(sharedTrelloCardLink || localTrelloCardLink);
            const trelloSlot = host.querySelector("#task-topic-trello-sync-slot");
            if (trelloSlot) {
                trelloSlot.innerHTML = `
                    <div class="trello-sync-panel" id="trello-sync-panel">
                        <h3>Trello Sync</h3>
                        <p>Open your Trello card quickly or send this work update to Trello.</p>
                        <label for="trello-card-url" class="trello-sync-label">Trello card or board link</label>
                        <input id="trello-card-url" class="trello-sync-input" type="url" placeholder="https://trello.com/c/xxxx1234 or /b/xxxx/board-name" value="${savedCardLink}">
                        ${trelloBoardHint ? `<p class="task-topic-submission-note">Expected shared board: <strong>${escapeHtml(trelloBoardHint)}</strong></p>` : ""}
                        <label for="trello-work-note" class="trello-sync-label">Work note</label>
                        <textarea id="trello-work-note" class="trello-sync-input trello-sync-note" placeholder="What did you complete today?"></textarea>
                        <div class="trello-sync-actions">
                            <button type="button" class="detail-action detail-action-secondary" id="trello-save-link-btn">Save Trello Link</button>
                            <button type="button" class="detail-action detail-action-secondary" id="trello-open-card-btn">Open Trello Card</button>
                            <button type="button" class="detail-action" id="trello-send-log-btn">Send Log to Trello (${completionPercent}%)</button>
                        </div>
                        <p class="trello-sync-status" id="trello-sync-status" aria-live="polite"></p>
                        <div class="trello-link-library" id="trello-link-library" ${mergedTrelloCardLibrary.length ? "" : "hidden"}>
                            <p class="trello-link-library-title">Saved Trello Links <span class="trello-link-library-count" id="trello-link-library-count">(${mergedTrelloCardLibrary.length})</span></p>
                            <ul class="trello-link-library-list" id="trello-link-library-list">
                                ${mergedTrelloCardLibrary.map((item) => `
                                    <li class="trello-link-library-item${item.favourite ? " is-favourite" : ""}" data-trello-link-item="${escapeHtml(item.url)}">
                                        <div class="trello-link-library-link-wrap">
                                            <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
                                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item.savedAt))}</span>
                                            ${item.favourite ? `<span class="trello-link-library-favourite-badge">&#9733; Favourite</span>` : ""}
                                        </div>
                                        <div class="trello-link-library-actions">
                                            <button type="button" class="trello-link-library-favourite-btn${item.favourite ? " is-favourite" : ""}" data-trello-library-favourite="${escapeHtml(item.url)}" aria-pressed="${item.favourite ? "true" : "false"}" title="${item.favourite ? "Favourite link used by Decomposition" : "Mark as Favourite"}">${item.favourite ? "&#9733;" : "&#9734;"}</button>
                                            <button type="button" class="detail-action detail-action-secondary" data-trello-library-use="${escapeHtml(item.url)}">Use</button>
                                            <button type="button" class="detail-action detail-action-secondary" data-trello-library-open="${escapeHtml(item.url)}">Open</button>
                                            <button type="button" class="detail-action detail-action-danger" data-trello-library-delete="${escapeHtml(item.url)}">Delete</button>
                                        </div>
                                    </li>
                                `).join("")}
                            </ul>
                        </div>
                    </div>
                `;
            }

            const githubSlot = host.querySelector("#task-topic-github-sync-slot");
            if (githubSlot && (showGithubGuide || isProjectManagementTaskTopicPage)) {
                const sharedGithubLink = getFirstGithubRepoUrlFromEvidenceRows(myAllocation?.evidence_steps);
                const sharedGithubLinks = getAllGithubRepoUrlsFromEvidenceRows(myAllocation?.evidence_steps);
                const localGithubRepoLibrary = readStoredGithubRepoLibrary(projectId, email);
                const mergedGithubRepoLibrary = writeStoredGithubRepoLibrary(
                    projectId,
                    email,
                    mergeGithubRepoLibrarySources(
                        [{ url: sharedGithubLink, savedAt: "" }],
                        sharedGithubLinks.map((url) => ({ url, savedAt: "" })),
                        localGithubRepoLibrary
                    )
                );
                githubSlot.innerHTML = `
                    <div class="trello-sync-panel" id="github-sync-panel" style="margin-top:10px;">
                        <h3>GitHub Sync</h3>
                        <p>Save your repository URL and a short progress note for version-control evidence.</p>
                        <label for="github-repo-url" class="trello-sync-label">GitHub repository link</label>
                        <input id="github-repo-url" class="trello-sync-input" type="url" placeholder="https://github.com/org/repo" value="${escapeHtml(sharedGithubLink)}">
                        <label for="github-work-note" class="trello-sync-label">Work note</label>
                        <textarea id="github-work-note" class="trello-sync-input trello-sync-note" placeholder="What commit or change did you complete?"></textarea>
                        <div class="trello-sync-actions">
                            <button type="button" class="detail-action detail-action-secondary" id="github-save-link-btn">Save GitHub Sync</button>
                            <button type="button" class="detail-action detail-action-secondary" id="github-open-repo-btn">Open Repository</button>
                        </div>
                        <p class="trello-sync-status" id="github-sync-status" aria-live="polite"></p>
                        <div class="trello-link-library" id="github-link-library" ${mergedGithubRepoLibrary.length ? "" : "hidden"}>
                            <p class="trello-link-library-title">Saved GitHub Links <span class="trello-link-library-count" id="github-link-library-count">(${mergedGithubRepoLibrary.length})</span></p>
                            <ul class="trello-link-library-list" id="github-link-library-list">
                                ${mergedGithubRepoLibrary.map((item) => `
                                    <li class="trello-link-library-item" data-github-link-item="${escapeHtml(item.url)}">
                                        <div class="trello-link-library-link-wrap">
                                            <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
                                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item.savedAt))}</span>
                                        </div>
                                        <div class="trello-link-library-actions">
                                            <button type="button" class="detail-action detail-action-secondary" data-github-library-use="${escapeHtml(item.url)}">Use</button>
                                            <button type="button" class="detail-action detail-action-secondary" data-github-library-open="${escapeHtml(item.url)}">Open</button>
                                            <button type="button" class="detail-action detail-action-danger" data-github-library-delete="${escapeHtml(item.url)}">Delete</button>
                                        </div>
                                    </li>
                                `).join("")}
                            </ul>
                        </div>
                        <div id="github-tracker-slot"></div>
                    </div>
                `;
                renderGithubProjectManagementTracker(githubSlot.querySelector("#github-tracker-slot"), sharedGithubLink || mergedGithubRepoLibrary[0]?.url || "");
            }
        }

        const oneDriveSlot = host.querySelector("#task-topic-onedrive-sync-slot");
        if (oneDriveSlot) {
            const sharedOneDriveLink = getFirstOneDriveFolderUrlFromEvidenceRows(myAllocation?.evidence_steps);
            const sharedOneDriveLinks = getAllOneDriveFolderUrlsFromEvidenceRows(myAllocation?.evidence_steps);
            const localOneDriveLinkLibrary = readStoredOneDriveLinkLibrary(projectId, email);
            const mergedOneDriveLinkLibrary = writeStoredOneDriveLinkLibrary(
                projectId,
                email,
                mergeOneDriveLinkLibrarySources(
                    [{ url: sharedOneDriveLink, savedAt: "" }],
                    sharedOneDriveLinks.map((url) => ({ url, savedAt: "" })),
                    localOneDriveLinkLibrary
                )
            );
            oneDriveSlot.innerHTML = `
                <div class="trello-sync-panel" id="onedrive-sync-panel">
                    <h3>Microsoft OneDrive Sync</h3>
                    <p>Save your OneDrive project folder link so your teacher can verify files and version history.</p>
                    <label for="onedrive-folder-url" class="trello-sync-label">OneDrive project folder link</label>
                    <input id="onedrive-folder-url" class="trello-sync-input" type="url" placeholder="https://onedrive.live.com/... or school SharePoint folder" value="${escapeHtml(sharedOneDriveLink)}">
                    <div class="trello-sync-actions">
                        <button type="button" class="detail-action detail-action-secondary" id="onedrive-save-link-btn">Save OneDrive Link</button>
                        <button type="button" class="detail-action detail-action-secondary" id="onedrive-open-folder-btn">Open OneDrive Folder</button>
                    </div>
                    <p class="trello-sync-status" id="onedrive-sync-status" aria-live="polite"></p>
                    <div class="trello-link-library" id="onedrive-link-library" ${mergedOneDriveLinkLibrary.length ? "" : "hidden"}>
                        <p class="trello-link-library-title">Saved OneDrive Links <span class="trello-link-library-count" id="onedrive-link-library-count">(${mergedOneDriveLinkLibrary.length})</span></p>
                        <ul class="trello-link-library-list" id="onedrive-link-library-list">
                            ${mergedOneDriveLinkLibrary.map((item) => `
                                <li class="trello-link-library-item" data-onedrive-link-item="${escapeHtml(item.url)}">
                                    <div class="trello-link-library-link-wrap">
                                        <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
                                        <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item.savedAt))}</span>
                                    </div>
                                    <div class="trello-link-library-actions">
                                        <button type="button" class="detail-action detail-action-secondary" data-onedrive-library-use="${escapeHtml(item.url)}">Use</button>
                                        <button type="button" class="detail-action detail-action-secondary" data-onedrive-library-open="${escapeHtml(item.url)}">Open</button>
                                        <button type="button" class="detail-action detail-action-danger" data-onedrive-library-delete="${escapeHtml(item.url)}">Delete</button>
                                    </div>
                                </li>
                            `).join("")}
                        </ul>
                    </div>
                </div>
            `;
        }

        const googleDriveSlot = host.querySelector("#task-topic-google-drive-sync-slot");
        if (googleDriveSlot) {
            const evidenceGoogleDriveLink = getFirstGoogleDriveFolderUrlFromEvidenceRows(myAllocation?.evidence_steps);
            const evidenceGoogleDriveLinks = getAllGoogleDriveFolderUrlsFromEvidenceRows(myAllocation?.evidence_steps);
            const savedGoogleDriveLink = evidenceGoogleDriveLink || templateLibraryProcessAssessmentUrl;
            const localGoogleDriveLinkLibrary = readStoredGoogleDriveLinkLibrary(projectId, email);
            const mergedGoogleDriveLinkLibrary = writeStoredGoogleDriveLinkLibrary(
                projectId,
                email,
                mergeGoogleDriveLinkLibrarySources(
                    [{ url: evidenceGoogleDriveLink, savedAt: "" }, { url: templateLibraryProcessAssessmentUrl, savedAt: "" }],
                    evidenceGoogleDriveLinks.map((url) => ({ url, savedAt: "" })),
                    localGoogleDriveLinkLibrary
                )
            );
            const usingTemplateLibraryProcessAssessment = !evidenceGoogleDriveLink && Boolean(templateLibraryProcessAssessmentUrl);
            googleDriveSlot.innerHTML = `
                <div class="trello-sync-panel" id="google-drive-sync-panel" style="margin-top:10px;">
                    <h3>Google Drive Sync</h3>
                    <p>Save your Google Drive project folder link so your teacher can verify files and version history.</p>
                    <label for="google-drive-folder-url" class="trello-sync-label">Google Drive project folder link</label>
                    <input id="google-drive-folder-url" class="trello-sync-input" type="url" placeholder="https://drive.google.com/..." value="${escapeHtml(savedGoogleDriveLink)}">
                    ${usingTemplateLibraryProcessAssessment ? `<p class="task-topic-submission-note">Loaded from your Template Library <strong>SeniorDTECH/Process Assessment</strong> folder setup.</p>` : ""}
                    <div class="trello-sync-actions">
                        <button type="button" class="detail-action detail-action-secondary" id="google-drive-save-link-btn">Save Google Drive Link</button>
                        <button type="button" class="detail-action detail-action-secondary" id="google-drive-open-folder-btn">Open Google Drive Folder</button>
                    </div>
                    <p class="trello-sync-status" id="google-drive-sync-status" aria-live="polite"></p>
                    <div class="trello-link-library" id="google-drive-link-library" ${mergedGoogleDriveLinkLibrary.length ? "" : "hidden"}>
                        <p class="trello-link-library-title">Saved Google Links <span class="trello-link-library-count" id="google-drive-link-library-count">(${mergedGoogleDriveLinkLibrary.length})</span></p>
                        <ul class="trello-link-library-list" id="google-drive-link-library-list">
                            ${mergedGoogleDriveLinkLibrary.map((item) => `
                                <li class="trello-link-library-item" data-google-drive-link-item="${escapeHtml(item.url)}">
                                    <div class="trello-link-library-link-wrap">
                                        <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
                                        <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item.savedAt))}</span>
                                    </div>
                                    <div class="trello-link-library-actions">
                                        <button type="button" class="detail-action detail-action-secondary" data-google-drive-library-use="${escapeHtml(item.url)}">Use</button>
                                        <button type="button" class="detail-action detail-action-secondary" data-google-drive-library-open="${escapeHtml(item.url)}">Open</button>
                                        <button type="button" class="detail-action detail-action-danger" data-google-drive-library-delete="${escapeHtml(item.url)}">Delete</button>
                                    </div>
                                </li>
                            `).join("")}
                        </ul>
                    </div>
                </div>
            `;
        }
    }

    try {
        await renderTaskTopicSubmissionPanel({
            host,
            projectId,
            detailData,
            email,
            isTeacher,
            interestData
        });
    } catch (_error) {
        // Keep sync controls interactive even if submission panel rendering fails.
    }

    if (!isTeacher && /digital\s+outcome\s+description|success\s+criteria|relevant\s+implications|development\s+steps|outcome\s+will\s+be\s+developed|trial\s+(?:the\s+)?components|triall?ing\s+(?:the\s+)?components/i.test(`${selectedTaskTopic} ${selectedTaskShortName}`)) {
        if (/relevant\s+implications/i.test(`${selectedTaskTopic} ${selectedTaskShortName}`)) {
            renderRelevantImplicationsFromSlide(host, readStoredRelevantImplicationsSlideUrl(projectId, email));
        } else {
            const isSuccessCriteriaPage = /success\s+criteria/i.test(`${selectedTaskTopic} ${selectedTaskShortName}`);
            let digitalOutcomeSourceUrl = readStoredTaskTopicSlideSyncEntryByTemplateId(projectId, email, "digital-outcome-description")?.url
                || readStoredTaskTopicSlideSyncEntryByShortName(projectId, email, "Digital Outcome Description")?.url
                || readStoredTaskTopicSlideSyncEntry(projectId, email, "Digital Outcome Description", "Digital Outcome Description")?.url
                || "";
            if (!digitalOutcomeSourceUrl) {
                // Fall back to the DB record written by Task List "Sync from Google Drive"
                digitalOutcomeSourceUrl = getDbTemplateCopyUrlById(await fetchDbTemplateCopies(projectId), "digital-outcome-description");
            }
            const syncedSlideLink = isSuccessCriteriaPage
                ? digitalOutcomeSourceUrl
                : (host.querySelector("#task-topic-google-slides-sync-reference a")?.href
                    || host.querySelector("#task-topic-google-slides-url")?.value
                    || readStoredTaskTopicSlideSyncLink(projectId, email, selectedTaskTopic, selectedTaskShortName)
                    || digitalOutcomeSourceUrl
                    || "");
            const isDevelopmentStepsPage = /development\s+steps|outcome\s+will\s+be\s+developed/i.test(`${selectedTaskTopic} ${selectedTaskShortName}`);
            const isTriallingComponentsPage = /trial\s+(?:the\s+)?components|triall?ing\s+(?:the\s+)?components/i.test(`${selectedTaskTopic} ${selectedTaskShortName}`);
            const targetId = isSuccessCriteriaPage
                ? "success-criteria-must-dos"
                : (isDevelopmentStepsPage ? "development-steps-must-dos" : (isTriallingComponentsPage ? "trialling-components-table" : "digital-outcome-must-dos"));
            if (isDevelopmentStepsPage) {
                void renderDevelopmentStepsMustDosTable(host, projectId, email);
            } else if (isTriallingComponentsPage) {
                void renderTriallingComponentsTable(host, projectId, email);
            } else {
                renderDigitalOutcomeMustDos(host, syncedSlideLink, targetId);
            }
            if (isSuccessCriteriaPage) {
                void renderRelevantImplicationNames(host, projectId, email);
            }
        }
    }

    if (!isTeacher && email && /testing\s+functions|test(?:ing)?\s+that\s+the\s+digital\s+technologies\s+outcome\s+functions/i.test(`${selectedTaskTopic} ${selectedTaskShortName}`)) {
        void renderTestingFunctionsLists(host, projectId, email);
    }

    // Render tools & techniques panel only on the dedicated Tools and Techniques topic page
    const isToolsAndTechniquesTopic = /tools\s+and\s+techniques/i.test(selectedTaskShortName)
        || /what\s+tools\s+and\s+techniques/i.test(selectedTaskTopic);
    if (!isTeacher && isToolsAndTechniquesTopic && email) {
        try {
            await renderToolsTechniquesPanel({
                host,
                projectId,
                detailData,
                taskTopic: selectedTaskTopic
            });
        } catch (_error) {
            // Keep page functional even if tools & techniques panel fails.
        }
    }

    if (!isTeacher && isAssessmentTask && email) {
        const myAllocation = interestData?.my_allocation || null;
        const assignedStandards = getEffectiveAssignedStandards(myAllocation, detailData);
        const taskDefaultsByStandard = buildTaskDefaultsByStandard(assignedStandards, detailData);

        if (assignedStandards.length) {
            try {
                await renderEvidenceSidebar({
                    host,
                    projectId,
                    viewerEmail: email,
                    studentEmail: email,
                    standards: Array.from(new Set(assignedStandards)),
                    studentLabel: "My progress",
                    taskDefaultsByStandard,
                    detailData,
                    taskTopic: selectedTaskTopic
                });
            } catch (_error) {
                // Sidebar issues should not block sync button handlers.
            }
        }
    }

    if (isTeacher && email) {
        const trelloStatusCells = Array.from(section.querySelectorAll(".interest-trello-status-cell[data-student-email]"));
        await Promise.all(trelloStatusCells.map(async (cell) => {
            const studentEmail = String(cell.getAttribute("data-student-email") || "").trim().toLowerCase();
            if (!studentEmail) {
                return;
            }

            try {
                const response = await fetch(`/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/evidence`, {
                    headers: buildWriteHeaders()
                });
                if (!response.ok) {
                    return;
                }

                const payload = await response.json().catch(() => ({}));
                const trelloCardUrl = getFirstTrelloCardUrlFromEvidenceRows(payload?.evidence_steps);
                if (!trelloCardUrl) {
                    return;
                }

                cell.setAttribute("data-trello-url", trelloCardUrl);
                cell.innerHTML = `<a class="interest-status interest-confirmed" href="${escapeHtml(trelloCardUrl)}" target="_blank" rel="noreferrer">Open Trello</a>`;
            } catch (_error) {
                // Keep the current fallback status if the evidence refresh fails.
            }
        }));

        await Promise.all(trelloStatusCells.map(async (cell) => {
            const studentEmail = String(cell.getAttribute("data-student-email") || "").trim().toLowerCase();
            const trelloUrl = String(cell.getAttribute("data-trello-url") || "").trim();
            if (!studentEmail || !trelloUrl) {
                return;
            }

            try {
                const progressResponse = await fetch(
                    `/api/integrations/trello/list-progress?student_email=${encodeURIComponent(studentEmail)}&board_url=${encodeURIComponent(trelloUrl)}`,
                    { headers: buildWriteHeaders() }
                );
                if (!progressResponse.ok) {
                    return;
                }

                const progress = await progressResponse.json().catch(() => ({}));
                const toDoCount = Number(progress?.todo_count);
                const doingCount = Number(progress?.doing_count);
                const doneCount = Number(progress?.done_count);
                const completionPercent = Number(progress?.completion_percent);
                if (!Number.isFinite(toDoCount) || !Number.isFinite(doingCount) || !Number.isFinite(doneCount)) {
                    return;
                }

                const safeCompletionPercent = Number.isFinite(completionPercent)
                    ? Math.max(0, Math.min(100, Math.round(completionPercent)))
                    : 0;
                const syncText = `To Do ${toDoCount} | Doing ${doingCount} | Done ${doneCount} | ${safeCompletionPercent}% complete`;
                cell.innerHTML = `${cell.innerHTML}<span class="interest-status" style="margin-left:8px;">${escapeHtml(syncText)}</span>`;
            } catch (_error) {
                // Keep baseline Trello status if list-progress sync fails.
            }
        }));

        section.querySelectorAll(".interest-progress-btn").forEach((button) => {
            button.addEventListener("click", async () => {
                const studentEmail = String(button.getAttribute("data-student-email") || "").trim().toLowerCase();
                const standards = String(button.getAttribute("data-standards") || "")
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean);

                if (!studentEmail || !standards.length) {
                    return;
                }

                const taskDefaultsByStandard = buildTaskDefaultsByStandard(standards, detailData);

                await renderEvidenceSidebar({
                    host,
                    projectId,
                    viewerEmail: email,
                    studentEmail,
                    standards,
                    studentLabel: studentEmail,
                    taskDefaultsByStandard,
                    detailData,
                    taskTopic: selectedTaskTopic
                });
            });
        });
    }

    const trelloCardInput = section.querySelector("#trello-card-url");
    const trelloWorkNoteInput = section.querySelector("#trello-work-note");
    const trelloSaveLinkBtn = section.querySelector("#trello-save-link-btn");
    const trelloOpenCardBtn = section.querySelector("#trello-open-card-btn");
    const trelloSendLogBtn = section.querySelector("#trello-send-log-btn");
    const trelloStatus = section.querySelector("#trello-sync-status");
    const trelloLinkLibrary = section.querySelector("#trello-link-library");
    const trelloLinkLibraryList = section.querySelector("#trello-link-library-list");
    const trelloLinkLibraryCount = section.querySelector("#trello-link-library-count");
    const oneDriveFolderInput = section.querySelector("#onedrive-folder-url");
    const oneDriveSaveLinkBtn = section.querySelector("#onedrive-save-link-btn");
    const oneDriveOpenFolderBtn = section.querySelector("#onedrive-open-folder-btn");
    const oneDriveStatus = section.querySelector("#onedrive-sync-status");
    const oneDriveLinkLibrary = section.querySelector("#onedrive-link-library");
    const oneDriveLinkLibraryList = section.querySelector("#onedrive-link-library-list");
    const oneDriveLinkLibraryCount = section.querySelector("#onedrive-link-library-count");
    const googleDriveFolderInput = section.querySelector("#google-drive-folder-url");
    const googleDriveSaveLinkBtn = section.querySelector("#google-drive-save-link-btn");
    const googleDriveOpenFolderBtn = section.querySelector("#google-drive-open-folder-btn");
    const googleDriveStatus = section.querySelector("#google-drive-sync-status");
    const googleDriveLinkLibrary = section.querySelector("#google-drive-link-library");
    const googleDriveLinkLibraryList = section.querySelector("#google-drive-link-library-list");
    const googleDriveLinkLibraryCount = section.querySelector("#google-drive-link-library-count");
    const githubRepoInput = section.querySelector("#github-repo-url");
    const githubWorkNoteInput = section.querySelector("#github-work-note");
    const githubSaveLinkBtn = section.querySelector("#github-save-link-btn");
    const githubOpenRepoBtn = section.querySelector("#github-open-repo-btn");
    const githubStatus = section.querySelector("#github-sync-status");
    const githubLinkLibrary = section.querySelector("#github-link-library");
    const githubLinkLibraryList = section.querySelector("#github-link-library-list");
    const githubLinkLibraryCount = section.querySelector("#github-link-library-count");

    if (oneDriveSaveLinkBtn) oneDriveSaveLinkBtn.dataset.syncBound = "1";
    if (oneDriveOpenFolderBtn) oneDriveOpenFolderBtn.dataset.syncBound = "1";
    if (googleDriveSaveLinkBtn) googleDriveSaveLinkBtn.dataset.syncBound = "1";
    if (googleDriveOpenFolderBtn) googleDriveOpenFolderBtn.dataset.syncBound = "1";

    const setTrelloStatus = (message, isError = false, isSuccess = false) => {
        if (!trelloStatus) return;
        trelloStatus.textContent = String(message || "");
        trelloStatus.classList.toggle("is-error", Boolean(isError));
        trelloStatus.classList.toggle("is-success", Boolean(isSuccess) && !Boolean(isError));
    };

    const setOneDriveStatus = (message, isError = false) => {
        if (!oneDriveStatus) return;
        oneDriveStatus.textContent = String(message || "");
        oneDriveStatus.classList.toggle("is-error", Boolean(isError));
    };

    const setGoogleDriveStatus = (message, isError = false) => {
        if (!googleDriveStatus) return;
        googleDriveStatus.textContent = String(message || "");
        googleDriveStatus.classList.toggle("is-error", Boolean(isError));
    };

    const setGithubStatus = (message, isError = false, isSuccess = false) => {
        if (!githubStatus) return;
        githubStatus.textContent = String(message || "");
        githubStatus.classList.toggle("is-error", Boolean(isError));
        githubStatus.classList.toggle("is-success", Boolean(isSuccess) && !Boolean(isError));
    };

    const backendTrelloCardLink = getFirstTrelloCardUrlFromEvidenceRows(interestData?.my_allocation?.evidence_steps);
    const backendTrelloCardLinks = getAllTrelloCardUrlsFromEvidenceRows(interestData?.my_allocation?.evidence_steps);
    const backendGithubRepoLink = getFirstGithubRepoUrlFromEvidenceRows(interestData?.my_allocation?.evidence_steps);
    const backendGithubRepoLinks = getAllGithubRepoUrlsFromEvidenceRows(interestData?.my_allocation?.evidence_steps);
    const backendOneDriveLink = getFirstOneDriveFolderUrlFromEvidenceRows(interestData?.my_allocation?.evidence_steps);
    const backendOneDriveLinks = getAllOneDriveFolderUrlsFromEvidenceRows(interestData?.my_allocation?.evidence_steps);
    const backendGoogleDriveLink = getFirstGoogleDriveFolderUrlFromEvidenceRows(interestData?.my_allocation?.evidence_steps);
    const backendGoogleDriveLinks = getAllGoogleDriveFolderUrlsFromEvidenceRows(interestData?.my_allocation?.evidence_steps);
    const localTrelloCardLink = readStoredTrelloCardLink(projectId, email);
    const localTrelloCardLibrary = readStoredTrelloCardLibrary(projectId, email);
    const localGithubRepoLibrary = readStoredGithubRepoLibrary(projectId, email);
    const localOneDriveLinkLibrary = readStoredOneDriveLinkLibrary(projectId, email);
    const localGoogleDriveLinkLibrary = readStoredGoogleDriveLinkLibrary(projectId, email);
    let trelloCardLibrary = writeStoredTrelloCardLibrary(
        projectId,
        email,
        mergeTrelloCardLibrarySources(
            [{ url: backendTrelloCardLink, savedAt: "" }, { url: localTrelloCardLink, savedAt: "" }],
            backendTrelloCardLinks.map((url) => ({ url, savedAt: "" })),
            localTrelloCardLibrary
        )
    );
    let githubRepoLibrary = writeStoredGithubRepoLibrary(
        projectId,
        email,
        mergeGithubRepoLibrarySources(
            [{ url: backendGithubRepoLink, savedAt: "" }],
            backendGithubRepoLinks.map((url) => ({ url, savedAt: "" })),
            localGithubRepoLibrary
        )
    );
    let oneDriveLinkLibraryState = writeStoredOneDriveLinkLibrary(
        projectId,
        email,
        mergeOneDriveLinkLibrarySources(
            [{ url: backendOneDriveLink, savedAt: "" }],
            backendOneDriveLinks.map((url) => ({ url, savedAt: "" })),
            localOneDriveLinkLibrary
        )
    );
    let googleDriveLinkLibraryState = writeStoredGoogleDriveLinkLibrary(
        projectId,
        email,
        mergeGoogleDriveLinkLibrarySources(
            [{ url: backendGoogleDriveLink, savedAt: "" }],
            backendGoogleDriveLinks.map((url) => ({ url, savedAt: "" })),
            localGoogleDriveLinkLibrary
        )
    );
    const legacyLibraryMigrationUrl = (() => {
        if (backendTrelloCardLink) {
            return "";
        }
        const fromDirect = toSafeTrelloCardUrl(localTrelloCardLink);
        if (fromDirect) {
            return fromDirect;
        }
        const firstLibraryUrl = Array.isArray(trelloCardLibrary) && trelloCardLibrary.length
            ? toSafeTrelloCardUrl(trelloCardLibrary[0]?.url || "")
            : "";
        return firstLibraryUrl;
    })();
    const needsLegacyTrelloMigration = Boolean(legacyLibraryMigrationUrl);

    if (backendGithubRepoLink) {
        setGithubStatus("Saved GitHub repository loaded.", false, true);
    }

    const renderTrelloCardLibrary = () => {
        if (!trelloLinkLibrary || !trelloLinkLibraryList) {
            return;
        }

        if (!trelloCardLibrary.length) {
            trelloLinkLibrary.hidden = true;
            if (trelloLinkLibraryCount) {
                trelloLinkLibraryCount.textContent = "(0)";
            }
            trelloLinkLibraryList.innerHTML = "";
            return;
        }

        const activeUrl = toSafeTrelloCardUrl(trelloCardInput?.value || "");
        trelloLinkLibrary.hidden = false;
        if (trelloLinkLibraryCount) {
            trelloLinkLibraryCount.textContent = `(${trelloCardLibrary.length})`;
        }
        trelloLinkLibraryList.innerHTML = trelloCardLibrary
            .map((item) => {
                const url = toSafeTrelloCardUrl(item?.url || "");
                if (!url) {
                    return "";
                }
                const isActive = Boolean(activeUrl && activeUrl === url);
                const isFavourite = Boolean(item?.favourite);
                return `
                    <li class="trello-link-library-item${isActive ? " is-active" : ""}${isFavourite ? " is-favourite" : ""}" data-trello-link-item="${escapeHtml(url)}">
                        <div class="trello-link-library-link-wrap">
                            <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item?.savedAt))}</span>
                            ${isFavourite ? `<span class="trello-link-library-favourite-badge">&#9733; Favourite</span>` : ""}
                        </div>
                        <div class="trello-link-library-actions">
                            <button type="button" class="trello-link-library-favourite-btn${isFavourite ? " is-favourite" : ""}" data-trello-library-favourite="${escapeHtml(url)}" aria-pressed="${isFavourite ? "true" : "false"}" title="${isFavourite ? "Favourite link used by Decomposition" : "Mark as Favourite"}">${isFavourite ? "&#9733;" : "&#9734;"}</button>
                            <button type="button" class="detail-action detail-action-secondary" data-trello-library-use="${escapeHtml(url)}">Use</button>
                            <button type="button" class="detail-action detail-action-secondary" data-trello-library-open="${escapeHtml(url)}">Open</button>
                            <button type="button" class="detail-action detail-action-danger" data-trello-library-delete="${escapeHtml(url)}">Delete</button>
                        </div>
                    </li>
                `;
            })
            .join("");
    };

    const readCardUrl = () => {
        const safe = toSafeTrelloCardUrl(trelloCardInput?.value || "");
        if (trelloCardInput && safe && trelloCardInput.value !== safe) {
            trelloCardInput.value = safe;
        }
        writeStoredTrelloCardLink(projectId, email, safe);
        renderTrelloCardLibrary();
        return safe;
    };

    const renderGithubRepoLibrary = () => {
        if (!githubLinkLibrary || !githubLinkLibraryList) {
            return;
        }

        if (!githubRepoLibrary.length) {
            githubLinkLibrary.hidden = true;
            if (githubLinkLibraryCount) {
                githubLinkLibraryCount.textContent = "(0)";
            }
            githubLinkLibraryList.innerHTML = "";
            return;
        }

        const activeUrl = toSafeGithubRepoUrl(githubRepoInput?.value || "");
        githubLinkLibrary.hidden = false;
        if (githubLinkLibraryCount) {
            githubLinkLibraryCount.textContent = `(${githubRepoLibrary.length})`;
        }
        githubLinkLibraryList.innerHTML = githubRepoLibrary
            .map((item) => {
                const url = toSafeGithubRepoUrl(item?.url || "");
                if (!url) {
                    return "";
                }
                const isActive = Boolean(activeUrl && activeUrl === url);
                return `
                    <li class="trello-link-library-item${isActive ? " is-active" : ""}" data-github-link-item="${escapeHtml(url)}">
                        <div class="trello-link-library-link-wrap">
                            <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item?.savedAt))}</span>
                        </div>
                        <div class="trello-link-library-actions">
                            <button type="button" class="detail-action detail-action-secondary" data-github-library-use="${escapeHtml(url)}">Use</button>
                            <button type="button" class="detail-action detail-action-secondary" data-github-library-open="${escapeHtml(url)}">Open</button>
                            <button type="button" class="detail-action detail-action-danger" data-github-library-delete="${escapeHtml(url)}">Delete</button>
                        </div>
                    </li>
                `;
            })
            .join("");
    };

    const renderOneDriveLinkLibrary = () => {
        if (!oneDriveLinkLibrary || !oneDriveLinkLibraryList) {
            return;
        }

        if (!oneDriveLinkLibraryState.length) {
            oneDriveLinkLibrary.hidden = true;
            if (oneDriveLinkLibraryCount) {
                oneDriveLinkLibraryCount.textContent = "(0)";
            }
            oneDriveLinkLibraryList.innerHTML = "";
            return;
        }

        const activeUrl = toSafeOneDriveFolderUrl(oneDriveFolderInput?.value || "");
        oneDriveLinkLibrary.hidden = false;
        if (oneDriveLinkLibraryCount) {
            oneDriveLinkLibraryCount.textContent = `(${oneDriveLinkLibraryState.length})`;
        }
        oneDriveLinkLibraryList.innerHTML = oneDriveLinkLibraryState
            .map((item) => {
                const url = toSafeOneDriveFolderUrl(item?.url || "");
                if (!url) {
                    return "";
                }
                const isActive = Boolean(activeUrl && activeUrl === url);
                return `
                    <li class="trello-link-library-item${isActive ? " is-active" : ""}" data-onedrive-link-item="${escapeHtml(url)}">
                        <div class="trello-link-library-link-wrap">
                            <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item?.savedAt))}</span>
                        </div>
                        <div class="trello-link-library-actions">
                            <button type="button" class="detail-action detail-action-secondary" data-onedrive-library-use="${escapeHtml(url)}">Use</button>
                            <button type="button" class="detail-action detail-action-secondary" data-onedrive-library-open="${escapeHtml(url)}">Open</button>
                            <button type="button" class="detail-action detail-action-danger" data-onedrive-library-delete="${escapeHtml(url)}">Delete</button>
                        </div>
                    </li>
                `;
            })
            .join("");
    };

    const renderGoogleDriveLinkLibrary = () => {
        if (!googleDriveLinkLibrary || !googleDriveLinkLibraryList) {
            return;
        }

        if (!googleDriveLinkLibraryState.length) {
            googleDriveLinkLibrary.hidden = true;
            if (googleDriveLinkLibraryCount) {
                googleDriveLinkLibraryCount.textContent = "(0)";
            }
            googleDriveLinkLibraryList.innerHTML = "";
            return;
        }

        const activeUrl = toSafeGoogleDriveFolderUrl(googleDriveFolderInput?.value || "");
        googleDriveLinkLibrary.hidden = false;
        if (googleDriveLinkLibraryCount) {
            googleDriveLinkLibraryCount.textContent = `(${googleDriveLinkLibraryState.length})`;
        }
        googleDriveLinkLibraryList.innerHTML = googleDriveLinkLibraryState
            .map((item) => {
                const url = toSafeGoogleDriveFolderUrl(item?.url || "");
                if (!url) {
                    return "";
                }
                const isActive = Boolean(activeUrl && activeUrl === url);
                return `
                    <li class="trello-link-library-item${isActive ? " is-active" : ""}" data-google-drive-link-item="${escapeHtml(url)}">
                        <div class="trello-link-library-link-wrap">
                            <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>
                            <span class="trello-link-library-savedat">${escapeHtml(formatLibrarySavedAtLabel(item?.savedAt))}</span>
                        </div>
                        <div class="trello-link-library-actions">
                            <button type="button" class="detail-action detail-action-secondary" data-google-drive-library-use="${escapeHtml(url)}">Use</button>
                            <button type="button" class="detail-action detail-action-secondary" data-google-drive-library-open="${escapeHtml(url)}">Open</button>
                            <button type="button" class="detail-action detail-action-danger" data-google-drive-library-delete="${escapeHtml(url)}">Delete</button>
                        </div>
                    </li>
                `;
            })
            .join("");
    };

    renderTrelloCardLibrary();
    renderGithubRepoLibrary();
    renderOneDriveLinkLibrary();
    renderGoogleDriveLinkLibrary();

    if (needsLegacyTrelloMigration && trelloCardInput) {
        trelloCardInput.value = toSafeTrelloCardUrl(localTrelloCardLink) || localTrelloCardLink;
        setTrelloStatus("This Trello link was only saved in this browser before. Saving it now will share it with teacher view.");

        void (async () => {
            try {
                const safeLocalUrl = toSafeTrelloCardUrl(legacyLibraryMigrationUrl);
                if (!safeLocalUrl) {
                    return;
                }

                await persistStudentTrelloLinkDirectlyToEvidence(projectId, email, detailData, taskTopicValue, safeLocalUrl);
                try {
                    await persistStudentTrelloLink(projectId, email, safeLocalUrl);
                } catch (_legacyError) {
                }
                setTrelloStatus("Your Trello link has been synced to teacher view.");
            } catch (_error) {
                // Keep the prompt visible so the student can use Save Trello Link manually.
            }
        })();
    }

    trelloCardInput?.addEventListener("change", () => {
        const raw = String(trelloCardInput.value || "").trim();
        if (!raw) {
            setTrelloStatus("");
            return;
        }

        const safe = toSafeTrelloCardUrl(raw);
        if (!safe) {
            setTrelloStatus("Enter a valid Trello card or board link (trello.com/c/... or trello.com/b/...).", true);
        } else {
            setTrelloStatus("Link looks valid. Click Save Trello Link.");
        }
        renderTrelloCardLibrary();
    });

    trelloLinkLibraryList?.addEventListener("click", async (event) => {
        const favouriteButton = event.target.closest("[data-trello-library-favourite]");
        if (favouriteButton) {
            const selectedUrl = toSafeTrelloCardUrl(favouriteButton.getAttribute("data-trello-library-favourite") || "");
            if (!selectedUrl) {
                return;
            }
            trelloCardLibrary = setFavouriteTrelloCardLibraryLink(projectId, email, selectedUrl);
            setTrelloStatus("Set as Favourite Trello link for Decomposition.", false, true);
            renderTrelloCardLibrary();
            return;
        }

        const useButton = event.target.closest("[data-trello-library-use]");
        if (useButton) {
            const selectedUrl = toSafeTrelloCardUrl(useButton.getAttribute("data-trello-library-use") || "");
            if (!selectedUrl) {
                return;
            }
            if (trelloCardInput) {
                trelloCardInput.value = selectedUrl;
            }
            writeStoredTrelloCardLink(projectId, email, selectedUrl);
            setTrelloStatus("Selected saved Trello link.", false, true);
            renderTrelloCardLibrary();
            return;
        }

        const openButton = event.target.closest("[data-trello-library-open]");
        if (openButton) {
            const selectedUrl = toSafeTrelloCardUrl(openButton.getAttribute("data-trello-library-open") || "");
            if (!selectedUrl) {
                return;
            }
            window.open(selectedUrl, "_blank", "noopener,noreferrer");
            setTrelloStatus("Opened saved Trello link.", false, true);
            return;
        }

        const deleteButton = event.target.closest("[data-trello-library-delete]");
        if (deleteButton) {
            const selectedUrl = toSafeTrelloCardUrl(deleteButton.getAttribute("data-trello-library-delete") || "");
            if (!selectedUrl || !window.confirm("Delete this saved Trello link?")) {
                return;
            }
            deleteButton.disabled = true;
            try {
                await removeUrlFromEvidenceSteps(projectId, email, selectedUrl, ["TRELLO_CARD_URL|"]);
                trelloCardLibrary = removeStoredTrelloCardLibraryLink(projectId, email, selectedUrl);
                if (trelloCardInput && toSafeTrelloCardUrl(trelloCardInput.value || "") === selectedUrl) {
                    trelloCardInput.value = "";
                }
                setTrelloStatus("Removed saved Trello link.", false, true);
            } catch (_error) {
                setTrelloStatus("Could not remove that Trello link right now.", true);
            } finally {
                renderTrelloCardLibrary();
            }
        }
    });

    trelloSaveLinkBtn?.addEventListener("click", async () => {
        const cardUrl = readCardUrl();
        if (!cardUrl) {
            setTrelloStatus("Enter a valid Trello card or board link first.", true);
            return;
        }

        if (trelloSaveLinkBtn) trelloSaveLinkBtn.disabled = true;
        setTrelloStatus("Saving Trello link...");
        try {
            // Primary strategy: persist directly through evidence rows (same path as checklist saves).
            await persistStudentTrelloLinkDirectlyToEvidence(projectId, email, detailData, taskTopicValue, cardUrl);

            // Secondary best-effort sync path; ignore errors because evidence rows already persisted.
            try {
                await persistStudentTrelloLink(projectId, email, cardUrl);
            } catch (_endpointError) {
            }

            const verifiedRows = await fetchEvidenceRowsEnsuringAllocation(projectId, email);
            const verifiedUrl = toSafeTrelloCardUrl(getFirstTrelloCardUrlFromEvidenceRows(verifiedRows));
            const latestSavedAt = getLatestTrelloSavedAtFromEvidenceRows(verifiedRows);
            if (!verifiedUrl) {
                throw new Error("Trello link did not persist to your Task List evidence.");
            }

            trelloCardLibrary = addStoredTrelloCardLibraryLink(projectId, email, cardUrl);
            renderTrelloCardLibrary();

            if (latestSavedAt) {
                setTrelloStatus(`Trello link saved and shared with teacher view (${formatSubmissionTimestamp(latestSavedAt)}).`, false, true);
            } else {
                setTrelloStatus("Trello link saved and shared with teacher view.", false, true);
            }
        } catch (error) {
            setTrelloStatus(`${error.message || "Could not save Trello link right now."}${formatApiDebugSuffix(error)}`, true);
        } finally {
            if (trelloSaveLinkBtn && trelloSaveLinkBtn.isConnected) trelloSaveLinkBtn.disabled = false;
        }
    });

    const readGithubRepoUrl = () => {
        const safe = toSafeGithubRepoUrl(githubRepoInput?.value || "");
        if (githubRepoInput && safe && githubRepoInput.value !== safe) {
            githubRepoInput.value = safe;
        }
        renderGithubRepoLibrary();
        return safe;
    };

    githubRepoInput?.addEventListener("change", () => {
        const raw = String(githubRepoInput.value || "").trim();
        if (!raw) {
            setGithubStatus("");
            return;
        }

        const safe = toSafeGithubRepoUrl(raw);
        if (!safe) {
            setGithubStatus("Enter a valid GitHub repository URL (github.com/owner/repo).", true);
            return;
        }
        setGithubStatus("Repository link looks valid. Click Save GitHub Sync.");
        renderGithubRepoLibrary();
    });

    githubLinkLibraryList?.addEventListener("click", async (event) => {
        const useButton = event.target.closest("[data-github-library-use]");
        if (useButton) {
            const selectedUrl = toSafeGithubRepoUrl(useButton.getAttribute("data-github-library-use") || "");
            if (!selectedUrl) {
                return;
            }
            if (githubRepoInput) {
                githubRepoInput.value = selectedUrl;
            }
            setGithubStatus("Selected saved GitHub repository.", false, true);
            renderGithubRepoLibrary();
            return;
        }

        const openButton = event.target.closest("[data-github-library-open]");
        if (openButton) {
            const selectedUrl = toSafeGithubRepoUrl(openButton.getAttribute("data-github-library-open") || "");
            if (!selectedUrl) {
                return;
            }
            window.open(selectedUrl, "_blank", "noopener,noreferrer");
            setGithubStatus("Opened saved GitHub repository.", false, true);
            return;
        }

        const deleteButton = event.target.closest("[data-github-library-delete]");
        if (deleteButton) {
            const selectedUrl = toSafeGithubRepoUrl(deleteButton.getAttribute("data-github-library-delete") || "");
            if (!selectedUrl || !window.confirm("Delete this saved GitHub link?")) {
                return;
            }
            deleteButton.disabled = true;
            try {
                await removeUrlFromEvidenceSteps(projectId, email, selectedUrl, ["GITHUB_REPO_URL|"]);
                githubRepoLibrary = removeStoredGithubRepoLibraryLink(projectId, email, selectedUrl);
                if (githubRepoInput && toSafeGithubRepoUrl(githubRepoInput.value || "") === selectedUrl) {
                    githubRepoInput.value = "";
                }
                setGithubStatus("Removed saved GitHub link.", false, true);
            } catch (_error) {
                setGithubStatus("Could not remove that GitHub link right now.", true);
            } finally {
                renderGithubRepoLibrary();
            }
        }
    });

    githubSaveLinkBtn?.addEventListener("click", async () => {
        const repoUrl = readGithubRepoUrl();
        if (!repoUrl) {
            setGithubStatus("Enter a valid GitHub repository URL first.", true);
            return;
        }

        const note = String(githubWorkNoteInput?.value || "").trim();
        if (githubSaveLinkBtn) githubSaveLinkBtn.disabled = true;
        setGithubStatus("Saving GitHub sync...");
        try {
            await persistStudentGithubSyncDirectlyToEvidence(projectId, email, detailData, taskTopicValue, repoUrl, note);
            try {
                await persistStudentGithubSync(projectId, email, repoUrl, note);
            } catch (_legacyError) {
                // my-evidence already contains github-sync rows; keep UX successful.
            }

            const verifiedRows = await fetchEvidenceRowsEnsuringAllocation(projectId, email);
            const verifiedRepoUrl = toSafeGithubRepoUrl(getFirstGithubRepoUrlFromEvidenceRows(verifiedRows));
            if (!verifiedRepoUrl) {
                throw new Error("GitHub link did not persist to your Task List evidence.");
            }

            githubRepoLibrary = addStoredGithubRepoLibraryLink(projectId, email, repoUrl);
            renderGithubRepoLibrary();
            setGithubStatus("GitHub sync saved and shared with teacher view.", false, true);
        } catch (error) {
            setGithubStatus(`${error?.message || "Could not save GitHub sync right now."}${formatApiDebugSuffix(error)}`, true);
        } finally {
            if (githubSaveLinkBtn && githubSaveLinkBtn.isConnected) githubSaveLinkBtn.disabled = false;
        }
    });

    githubOpenRepoBtn?.addEventListener("click", () => {
        const repoUrl = readGithubRepoUrl();
        if (!repoUrl) {
            setGithubStatus("Enter a valid GitHub repository URL first.", true);
            return;
        }

        window.open(repoUrl, "_blank", "noopener,noreferrer");
        setGithubStatus("Opened GitHub repository.", false, true);
    });

    trelloOpenCardBtn?.addEventListener("click", () => {
        const cardUrl = readCardUrl();
        if (!cardUrl) {
            setTrelloStatus("Enter a valid Trello card or board link first.", true);
            return;
        }

        window.open(cardUrl, "_blank", "noopener,noreferrer");
        setTrelloStatus("Opened Trello link.", false, true);
    });

    trelloSendLogBtn?.addEventListener("click", async () => {
        const cardUrl = readCardUrl();
        if (!cardUrl) {
            setTrelloStatus("Enter a valid Trello card or board link first.", true);
            return;
        }

        const myAllocation = interestData?.my_allocation || null;
        const assignedStandards = getEffectiveAssignedStandards(myAllocation, detailData);
        const completionPercent = getEvidenceCompletionPercentFromRows(myAllocation?.evidence_steps, assignedStandards);

        const note = String(trelloWorkNoteInput?.value || "").trim();
        if (trelloSendLogBtn) trelloSendLogBtn.disabled = true;
        setTrelloStatus("Sending log to Trello...");

        try {
            const response = await fetch("/api/integrations/trello/work-log", {
                method: "POST",
                headers: buildWriteHeaders(),
                body: JSON.stringify({
                    card_url: cardUrl,
                    note,
                    activity_title: String(detailData?.title || "").trim(),
                    progress_percent: completionPercent
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error || "Could not send log to Trello.");
            }

            const payload = await response.json().catch(() => ({}));
            if (trelloWorkNoteInput) {
                trelloWorkNoteInput.value = "";
            }

            const cardUrlFromApi = toSafeTrelloCardUrl(payload?.card_url || cardUrl);
            if (cardUrlFromApi && trelloCardInput) {
                trelloCardInput.value = cardUrlFromApi;
                writeStoredTrelloCardLink(projectId, email, cardUrlFromApi);
                trelloCardLibrary = addStoredTrelloCardLibraryLink(projectId, email, cardUrlFromApi);
                renderTrelloCardLibrary();
            }

            setTrelloStatus("Work log sent to Trello.", false, true);
        } catch (error) {
            setTrelloStatus(error.message || "Could not send log to Trello.", true);
        } finally {
            if (trelloSendLogBtn && trelloSendLogBtn.isConnected) trelloSendLogBtn.disabled = false;
        }
    });

    const readOneDriveFolderUrl = () => {
        const safe = toSafeOneDriveFolderUrl(oneDriveFolderInput?.value || "");
        if (oneDriveFolderInput && safe && oneDriveFolderInput.value !== safe) {
            oneDriveFolderInput.value = safe;
        }
        renderOneDriveLinkLibrary();
        return safe;
    };

    oneDriveFolderInput?.addEventListener("change", () => {
        const raw = String(oneDriveFolderInput.value || "").trim();
        if (!raw) {
            setOneDriveStatus("");
            return;
        }

        const safe = toSafeExternalUrl(raw);
        if (!safe) {
            setOneDriveStatus("Enter a valid OneDrive or SharePoint folder link.", true);
            return;
        }

        if (!/(onedrive\.live\.com|1drv\.ms|sharepoint\.com)/i.test(safe)) {
            setOneDriveStatus("Use a OneDrive or SharePoint folder URL so teacher access works.", true);
            return;
        }

        setOneDriveStatus("Link looks valid. Click Save OneDrive Link.");
        renderOneDriveLinkLibrary();
    });

    oneDriveLinkLibraryList?.addEventListener("click", async (event) => {
        const useButton = event.target.closest("[data-onedrive-library-use]");
        if (useButton) {
            const selectedUrl = toSafeOneDriveFolderUrl(useButton.getAttribute("data-onedrive-library-use") || "");
            if (!selectedUrl) {
                return;
            }
            if (oneDriveFolderInput) {
                oneDriveFolderInput.value = selectedUrl;
            }
            setOneDriveStatus("Selected saved OneDrive link.");
            renderOneDriveLinkLibrary();
            return;
        }

        const openButton = event.target.closest("[data-onedrive-library-open]");
        if (openButton) {
            const selectedUrl = toSafeOneDriveFolderUrl(openButton.getAttribute("data-onedrive-library-open") || "");
            if (!selectedUrl) {
                return;
            }
            window.open(selectedUrl, "_blank", "noopener,noreferrer");
            setOneDriveStatus("Opened saved OneDrive link.");
            return;
        }

        const deleteButton = event.target.closest("[data-onedrive-library-delete]");
        if (deleteButton) {
            const selectedUrl = toSafeOneDriveFolderUrl(deleteButton.getAttribute("data-onedrive-library-delete") || "");
            if (!selectedUrl || !window.confirm("Delete this saved OneDrive link?")) {
                return;
            }
            deleteButton.disabled = true;
            try {
                await removeUrlFromEvidenceSteps(projectId, email, selectedUrl, ["ONEDRIVE_PROJECT_FOLDER_URL|", "MEDIA_ASSET_FOLDER_URL|"]);
                oneDriveLinkLibraryState = removeStoredOneDriveLinkLibraryLink(projectId, email, selectedUrl);
                if (oneDriveFolderInput && toSafeOneDriveFolderUrl(oneDriveFolderInput.value || "") === selectedUrl) {
                    oneDriveFolderInput.value = "";
                }
                setOneDriveStatus("Removed saved OneDrive link.");
            } catch (_error) {
                setOneDriveStatus("Could not remove that OneDrive link right now.", true);
            } finally {
                renderOneDriveLinkLibrary();
            }
        }
    });

    oneDriveSaveLinkBtn?.addEventListener("click", async () => {
        const folderUrl = readOneDriveFolderUrl();
        if (!folderUrl) {
            setOneDriveStatus("Enter a valid OneDrive or SharePoint folder link first.", true);
            return;
        }

        if (oneDriveSaveLinkBtn) oneDriveSaveLinkBtn.disabled = true;
        setOneDriveStatus("Saving OneDrive link...");
        try {
            await persistStudentOneDriveFolderLink(projectId, email, detailData, taskTopicValue, folderUrl);
            oneDriveLinkLibraryState = addStoredOneDriveLinkLibraryLink(projectId, email, folderUrl);
            renderOneDriveLinkLibrary();
            setOneDriveStatus("OneDrive link saved and shared with teacher view.");
        } catch (error) {
            const fallback = "Could not save OneDrive link right now.";
            setOneDriveStatus(`${error?.message || fallback}${formatApiDebugSuffix(error)}`, true);
        } finally {
            if (oneDriveSaveLinkBtn && oneDriveSaveLinkBtn.isConnected) oneDriveSaveLinkBtn.disabled = false;
        }
    });

    oneDriveOpenFolderBtn?.addEventListener("click", () => {
        const folderUrl = readOneDriveFolderUrl();
        if (!folderUrl) {
            setOneDriveStatus("Enter a valid OneDrive or SharePoint folder link first.", true);
            return;
        }

        window.open(folderUrl, "_blank", "noopener,noreferrer");
        setOneDriveStatus("Opened OneDrive folder.");
    });

    const readGoogleDriveFolderUrl = () => {
        const safe = toSafeGoogleDriveFolderUrl(googleDriveFolderInput?.value || "");
        if (googleDriveFolderInput && safe && googleDriveFolderInput.value !== safe) {
            googleDriveFolderInput.value = safe;
        }
        renderGoogleDriveLinkLibrary();
        return safe;
    };

    googleDriveFolderInput?.addEventListener("change", () => {
        const raw = String(googleDriveFolderInput.value || "").trim();
        if (!raw) {
            setGoogleDriveStatus("");
            return;
        }

        const safe = toSafeExternalUrl(raw);
        if (!safe) {
            setGoogleDriveStatus("Enter a valid Google Drive folder link.", true);
            return;
        }

        if (!/(drive\.google\.com)/i.test(safe)) {
            setGoogleDriveStatus("Use a Google Drive folder URL so teacher access works.", true);
            return;
        }

        setGoogleDriveStatus("Link looks valid. Click Save Google Drive Link.");
        renderGoogleDriveLinkLibrary();
    });

    googleDriveLinkLibraryList?.addEventListener("click", async (event) => {
        const useButton = event.target.closest("[data-google-drive-library-use]");
        if (useButton) {
            const selectedUrl = toSafeGoogleDriveFolderUrl(useButton.getAttribute("data-google-drive-library-use") || "");
            if (!selectedUrl) {
                return;
            }
            if (googleDriveFolderInput) {
                googleDriveFolderInput.value = selectedUrl;
            }
            setGoogleDriveStatus("Selected saved Google Drive link.");
            renderGoogleDriveLinkLibrary();
            return;
        }

        const openButton = event.target.closest("[data-google-drive-library-open]");
        if (openButton) {
            const selectedUrl = toSafeGoogleDriveFolderUrl(openButton.getAttribute("data-google-drive-library-open") || "");
            if (!selectedUrl) {
                return;
            }
            window.open(selectedUrl, "_blank", "noopener,noreferrer");
            setGoogleDriveStatus("Opened saved Google Drive link.");
            return;
        }

        const deleteButton = event.target.closest("[data-google-drive-library-delete]");
        if (deleteButton) {
            const selectedUrl = toSafeGoogleDriveFolderUrl(deleteButton.getAttribute("data-google-drive-library-delete") || "");
            if (!selectedUrl || !window.confirm("Delete this saved Google Drive link?")) {
                return;
            }
            deleteButton.disabled = true;
            try {
                await removeUrlFromEvidenceSteps(projectId, email, selectedUrl, ["GOOGLE_DRIVE_PROJECT_FOLDER_URL|"]);
                googleDriveLinkLibraryState = removeStoredGoogleDriveLinkLibraryLink(projectId, email, selectedUrl);
                if (googleDriveFolderInput && toSafeGoogleDriveFolderUrl(googleDriveFolderInput.value || "") === selectedUrl) {
                    googleDriveFolderInput.value = "";
                }
                setGoogleDriveStatus("Removed saved Google Drive link.");
            } catch (_error) {
                setGoogleDriveStatus("Could not remove that Google Drive link right now.", true);
            } finally {
                renderGoogleDriveLinkLibrary();
            }
        }
    });

    googleDriveSaveLinkBtn?.addEventListener("click", async () => {
        const folderUrl = readGoogleDriveFolderUrl();
        if (!folderUrl) {
            setGoogleDriveStatus("Enter a valid Google Drive folder link first.", true);
            return;
        }

        if (googleDriveSaveLinkBtn) googleDriveSaveLinkBtn.disabled = true;
        setGoogleDriveStatus("Saving Google Drive link...");
        try {
            await persistStudentGoogleDriveFolderLink(projectId, email, detailData, taskTopicValue, folderUrl);
            googleDriveLinkLibraryState = addStoredGoogleDriveLinkLibraryLink(projectId, email, folderUrl);
            renderGoogleDriveLinkLibrary();
            setGoogleDriveStatus("Google Drive link saved and shared with teacher view.");
        } catch (error) {
            const fallback = "Could not save Google Drive link right now.";
            setGoogleDriveStatus(`${error?.message || fallback}${formatApiDebugSuffix(error)}`, true);
        } finally {
            if (googleDriveSaveLinkBtn && googleDriveSaveLinkBtn.isConnected) googleDriveSaveLinkBtn.disabled = false;
        }
    });

    googleDriveOpenFolderBtn?.addEventListener("click", () => {
        const folderUrl = readGoogleDriveFolderUrl();
        if (!folderUrl) {
            setGoogleDriveStatus("Enter a valid Google Drive folder link first.", true);
            return;
        }

        window.open(folderUrl, "_blank", "noopener,noreferrer");
        setGoogleDriveStatus("Opened Google Drive folder.");
    });

    const googleFormSlot = host.querySelector("#task-topic-google-form-sync-slot");
    if (googleFormSlot && isTestingFunctionsTaskTopicPage) {
        const currentGoogleFormUrl = getFirstGoogleFormUrlFromEvidenceRows(myAllocation?.evidence_steps);
        const googleFormLinkLibrary = readStoredGoogleFormLinkLibrary(projectId, email);
        googleFormSlot.innerHTML = `
            <div class="trello-sync-panel google-form-sync-panel" id="google-form-sync-panel">
                <h3 class="google-form-sync-title"><img src="https://ssl.gstatic.com/docs/forms/device_home.ico" alt="" aria-hidden="true"> Client Google Feedback Form</h3>
                <p>Link the Google Form you will use to collect client or user feedback.</p>
                <label for="google-form-url" class="trello-sync-label">Google Form link</label>
                <input id="google-form-url" class="trello-sync-input" type="url" placeholder="https://forms.google.com/... or https://forms.gle/..." value="${escapeHtml(currentGoogleFormUrl)}">
                <div class="trello-sync-actions">
                    <button type="button" class="detail-action detail-action-secondary" id="google-form-save-link-btn">Save Google Form Link</button>
                    <button type="button" class="detail-action detail-action-secondary" id="google-form-open-link-btn">Open Google Form</button>
                </div>
                <div class="google-form-link-library" id="google-form-link-library">
                    <p class="trello-link-library-title">Saved Google Forms <span class="trello-link-library-count">(${googleFormLinkLibrary.length})</span></p>
                    ${googleFormLinkLibrary.map((item) => `
                        <div class="trello-link-library-item">
                            <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a>
                            <div class="trello-link-library-actions">
                                <button type="button" class="detail-action detail-action-secondary" data-google-form-use="${escapeHtml(item.url)}">Use</button>
                                <button type="button" class="detail-action detail-action-secondary" data-google-form-open="${escapeHtml(item.url)}">Open</button>
                                <button type="button" class="detail-action detail-action-danger" data-google-form-delete="${escapeHtml(item.url)}">Delete</button>
                            </div>
                            <span class="trello-link-library-savedat">saved earlier</span>
                        </div>
                    `).join("")}
                </div>
                <p class="trello-sync-status" id="google-form-sync-status" aria-live="polite"></p>
            </div>
        `;
    }

    const googleFormInput = googleFormSlot?.querySelector("#google-form-url");
    const googleFormSaveLinkBtn = googleFormSlot?.querySelector("#google-form-save-link-btn");
    const googleFormOpenLinkBtn = googleFormSlot?.querySelector("#google-form-open-link-btn");
    const googleFormStatus = googleFormSlot?.querySelector("#google-form-sync-status");
    const setGoogleFormStatus = (message, isError = false) => {
        if (!googleFormStatus) return;
        googleFormStatus.textContent = String(message || "");
        googleFormStatus.classList.toggle("is-error", Boolean(isError));
    };
    const readGoogleFormUrl = () => toSafeGoogleFormUrl(googleFormInput?.value || "");

    googleFormSlot?.addEventListener("click", async (event) => {
        const useButton = event.target.closest("[data-google-form-use]");
        const openButton = event.target.closest("[data-google-form-open]");
        const deleteButton = event.target.closest("[data-google-form-delete]");
        const selectedUrl = useButton?.getAttribute("data-google-form-use")
            || openButton?.getAttribute("data-google-form-open")
            || deleteButton?.getAttribute("data-google-form-delete");
        if (!selectedUrl) return;

        if (useButton) {
            if (googleFormInput) googleFormInput.value = selectedUrl;
            setGoogleFormStatus("Saved Google Form selected. Click Save Google Form Link to make it current.");
            return;
        }
        if (openButton) {
            window.open(selectedUrl, "_blank", "noopener,noreferrer");
            setGoogleFormStatus("Opened saved Google Form.");
            return;
        }
        if (deleteButton) {
            if (!window.confirm("Delete this saved Google Form link?")) return;
            deleteButton.disabled = true;
            try {
                await removeUrlFromEvidenceSteps(projectId, email, selectedUrl, ["GOOGLE_FORM_URL|"]);
                removeStoredGoogleFormLinkLibraryLink(projectId, email, selectedUrl);
                deleteButton.closest(".trello-link-library-item")?.remove();
                setGoogleFormStatus("Removed saved Google Form link.");
            } catch (_error) {
                setGoogleFormStatus("Could not remove that Google Form link.", true);
                deleteButton.disabled = false;
            }
        }
    });

    googleFormInput?.addEventListener("change", () => {
        const raw = String(googleFormInput.value || "").trim();
        if (!raw) {
            setGoogleFormStatus("");
            return;
        }
        const safe = readGoogleFormUrl();
        if (!safe) {
            setGoogleFormStatus("Use a Google Forms link from forms.gle or docs.google.com/forms.", true);
            return;
        }
        googleFormInput.value = safe;
        setGoogleFormStatus("Link looks valid. Click Save Google Form Link.");
    });

    googleFormSaveLinkBtn?.addEventListener("click", async () => {
        const formUrl = readGoogleFormUrl();
        if (!formUrl) {
            setGoogleFormStatus("Enter a valid Google Forms link first.", true);
            return;
        }
        googleFormSaveLinkBtn.disabled = true;
        setGoogleFormStatus("Saving Google Form link...");
        try {
            await persistStudentGoogleFormLink(projectId, email, detailData, taskTopicValue, formUrl);
            addStoredGoogleFormLinkLibraryLink(projectId, email, formUrl);
            googleFormInput.value = formUrl;
            setGoogleFormStatus("Google Form link saved and shared with teacher view.");
            await loadAndRenderInterestSection(host, projectId, isTeacher, detailData);
            const refreshedGoogleFormStatus = host.querySelector("#google-form-sync-status");
            if (refreshedGoogleFormStatus) refreshedGoogleFormStatus.textContent = "Google Form link saved and shared with teacher view.";
        } catch (error) {
            setGoogleFormStatus(`${error?.message || "Could not save Google Form link right now."}${formatApiDebugSuffix(error)}`, true);
        } finally {
            if (googleFormSaveLinkBtn.isConnected) googleFormSaveLinkBtn.disabled = false;
        }
    });

    googleFormOpenLinkBtn?.addEventListener("click", () => {
        const formUrl = readGoogleFormUrl();
        if (!formUrl) {
            setGoogleFormStatus("Enter a valid Google Forms link first.", true);
            return;
        }
        window.open(formUrl, "_blank", "noopener,noreferrer");
        setGoogleFormStatus("Opened Google Form.");
    });

    if (email && !isTeacher && isTaskTopicPage && isUseOfToolsTechniquesCriterion(selectedTaskTopic, selectedTaskShortName)) {
        await renderUseOfToolsTechniquesPanel(host, projectId, interestData?.my_allocation || null);
    }

    if (isCodeValidationTaskTopicPage && email) {
        renderCodeValidationSyncPanel(host, projectId, email, "html");
        renderCodeValidationSyncPanel(host, projectId, email, "css");
        renderCodeValidationTechnicalHealthTracker(host, backendGithubRepoLink || githubRepoLibrary[0]?.url || "");
    }

    // Toggle interest button handler
    const toggleBtn = section.querySelector("#interest-toggle-btn");
    if (toggleBtn && email) {
        toggleBtn.addEventListener("click", async () => {
            toggleBtn.disabled = true;
            try {
                const resp = await fetch(`/api/activities/${encodeURIComponent(projectId)}/interest`, {
                    method: "POST",
                    headers: buildWriteHeaders()
                });
                if (resp.ok) {
                    const data = await resp.json();
                    toggleBtn.textContent = data.interested ? "\u2713 I'm Interested" : "I'm Interested";
                    toggleBtn.classList.toggle("is-interested", Boolean(data.interested));
                    const countEl = section.querySelector("#interest-count-text");
                    if (countEl) {
                        const c = data.count;
                        countEl.textContent = c === 0
                            ? "No students have registered interest yet."
                            : c === 1
                                ? `1 student is interested in this ${isAssessmentTask ? "task" : "project"}.`
                                : `${c} students are interested in this ${isAssessmentTask ? "task" : "project"}.`;
                    }

                    await loadAndRenderInterestSection(host, projectId, isTeacher, detailData);
                }
            } catch (_err) {}
            toggleBtn.disabled = false;
        });
    }

    const assignForm = section.querySelector("#interest-assign-form");
    if (assignForm && email) {
        const assignInput = section.querySelector("#interest-assign-email");
        const assignStatus = section.querySelector("#interest-assign-status");

        const setAssignStatus = (message, isError = false) => {
            if (!assignStatus) return;
            assignStatus.textContent = message;
            assignStatus.classList.toggle("is-error", isError);
        };

        assignForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const normalizedEmail = normalizeStudentEmailInput(assignInput?.value || "");
            if (!normalizedEmail) {
                setAssignStatus("Enter a student email.", true);
                return;
            }

            if (detailAllowedDomain && !normalizedEmail.endsWith(`@${detailAllowedDomain}`)) {
                setAssignStatus(`Email must end with @${detailAllowedDomain}.`, true);
                return;
            }

            const assignBtn = assignForm.querySelector("button[type='submit']");
            if (assignBtn) assignBtn.disabled = true;
            setAssignStatus("Adding student...");

            try {
                const resp = await fetch(`/api/activities/${encodeURIComponent(projectId)}/interests`, {
                    method: "POST",
                    headers: buildWriteHeaders(),
                    body: JSON.stringify({ student_email: normalizedEmail })
                });

                if (!resp.ok) {
                    const errorData = await resp.json().catch(() => ({}));
                    throw new Error(errorData.error || "Could not add student.");
                }

                // Auto-assign standards from activity details so Progress button appears immediately.
                const autoStandards = deriveEvidenceStandardsFromDetailData(detailData);
                if (autoStandards.length) {
                    try {
                        await fetch(`/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(normalizedEmail)}/standards`, {
                            method: "PATCH",
                            headers: buildWriteHeaders(),
                            body: JSON.stringify({
                                standard_1: autoStandards[0] || "",
                                standard_2: autoStandards[1] || ""
                            })
                        });
                    } catch (_ignoreStandardsError) {
                        // Non-fatal: progress will still work via client-side fallback.
                    }
                }

                setAssignStatus("Student allocated.");
                if (assignInput) assignInput.value = "";
                await loadAndRenderInterestSection(host, projectId, isTeacher, detailData);
            } catch (error) {
                setAssignStatus(error.message || "Could not add student.", true);
            } finally {
                if (assignBtn && assignBtn.isConnected) assignBtn.disabled = false;
            }
        });
    }

    const backfillButton = section.querySelector("#client-projects-backfill-btn");
    if (backfillButton && email) {
        const backfillStatus = section.querySelector("#client-projects-backfill-status");
        const setBackfillStatus = (message, isError = false) => {
            if (!backfillStatus) return;
            backfillStatus.textContent = String(message || "");
            backfillStatus.classList.toggle("is-error", Boolean(isError));
        };

        backfillButton.addEventListener("click", async () => {
            backfillButton.disabled = true;
            setBackfillStatus("Running backfill...");
            try {
                const resp = await fetch("/api/client-projects/backfill", {
                    method: "POST",
                    headers: buildWriteHeaders()
                });
                if (!resp.ok) {
                    const payload = await resp.json().catch(() => ({}));
                    throw new Error(payload?.error || "Could not run backfill.");
                }

                const payload = await resp.json().catch(() => ({}));
                const inserted = Number(payload?.inserted || 0);
                setBackfillStatus(`Backfill complete. ${inserted} student allocation(s) added.`);
                await loadAndRenderInterestSection(host, projectId, isTeacher, detailData);
            } catch (error) {
                setBackfillStatus(error.message || "Could not run backfill.", true);
            } finally {
                if (backfillButton && backfillButton.isConnected) backfillButton.disabled = false;
            }
        });
    }

    // Confirm/unconfirm allocation buttons (teacher only)
    section.querySelectorAll(".interest-confirm-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const row = btn.closest("tr[data-student]");
            if (!row) return;
            const studentEmail = row.getAttribute("data-student");
            const currentlyConfirmed = btn.getAttribute("data-confirmed") === "true";
            const newConfirmed = !currentlyConfirmed;
            btn.disabled = true;
            try {
                const resp = await fetch(
                    `/api/activities/${encodeURIComponent(projectId)}/interests/${encodeURIComponent(studentEmail)}/confirm`,
                    {
                        method: "PATCH",
                        headers: buildWriteHeaders(),
                        body: JSON.stringify({ confirmed: newConfirmed })
                    }
                );
                if (resp.ok) {
                    btn.setAttribute("data-confirmed", String(newConfirmed));
                    btn.textContent = newConfirmed ? "Unconfirm" : "Confirm";
                    const statusCell = row.querySelector(".interest-status");
                    if (statusCell) {
                        statusCell.textContent = newConfirmed ? "Confirmed" : "Pending";
                        statusCell.className = newConfirmed ? "interest-status interest-confirmed" : "interest-status interest-pending";
                    }
                }
            } catch (_err) {}
            btn.disabled = false;
        });
    });
}

initDetail();
