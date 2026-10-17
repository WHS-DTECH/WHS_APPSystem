"use strict";

(() => {
    const ACTIVITY_ID = "activity-encoding-binary";
    const API_URL = `/api/learning-pathways/activity-progress/${ACTIVITY_ID}`;
    const PLACES = [16, 8, 4, 2, 1];
    const WORD = "TECHNOLOGY";
    const EMPTY = "00000";
    const letterValue = (letter) => letter.charCodeAt(0) - 64;
    const toBinary = (value) => value.toString(2).padStart(5, "0");
    const totalOf = (bits) => PLACES.reduce((sum, place, index) => sum + (bits[index] === "1" ? place : 0), 0);
    const cleanWord = (value) => String(value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10);
    const isBits = (value) => typeof value === "string" && /^[01]{5}$/.test(value);
    // T (index 0) is the worked example.
    const letters = [...WORD].map((letter, index) => ({ index, letter, value: letterValue(letter) })).slice(1);

    function letterStatus(bits, target) {
        const total = totalOf(bits);
        if (total === target) return { state: "correct", text: `\u2713 Correct! ${target} = ${bits}` };
        if (total > target) return { state: "over", text: `Total is ${total}. That is bigger than ${target} \u2014 turn a place value OFF.` };
        return { state: "working", text: total ? `Total so far: ${total}. Keep going!` : `Turn on place values that add up to ${target}.` };
    }

    function missingAnswers(responses) {
        const missing = [];
        for (const { index, letter, value } of letters) {
            if (responses.letters[index] !== toBinary(value)) missing.push(`${letter} = ${value}`);
        }
        return missing;
    }

    if (typeof window !== "undefined") window.EncodingBinaryActivity = { toBinary, totalOf, letterStatus, missingAnswers, cleanWord };
    const root = typeof document !== "undefined" ? document.querySelector(".encoding-activity") : null;
    if (!root) return;

    const state = { practice: EMPTY, letters: {}, challenge: { word: "", bits: [] } };
    for (const { index } of letters) state.letters[index] = EMPTY;
    let completed = false;
    let loadedFor = "";
    let loadRequest = 0;
    let dirty = false;
    let saveTimer = 0;
    let retryTimer = 0;
    let saveChain = Promise.resolve();

    const $ = (selector) => document.querySelector(selector);
    const saveStatus = $("#encoding-save-status");
    const practiceFeedback = $("#encoding-practice-feedback");
    const finishFeedback = $("#encoding-finish-feedback");
    const completePanel = $("#encoding-complete");
    const messageOutput = $("#encoding-message");
    const challengeInput = $("#encoding-challenge-word");
    const challengeHost = $("#encoding-challenge");
    const challengeMessage = $("#encoding-challenge-message");
    const challengeMessageBits = $("#encoding-challenge-bits");
    const challengeMessageDone = $("#encoding-challenge-done");

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    const setStatus = (text, tone = "") => {
        saveStatus.textContent = text;
        saveStatus.dataset.tone = tone;
    };

    function bitRow({ letter, target, getBits, setBits, immediate }) {
        const row = el("div", "encoding-row");
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", `${letter} = ${target}`);
        const head = el("div", "encoding-row-head");
        head.append(el("span", "encoding-letter", letter), el("span", "encoding-value", `= ${target}`));
        const toggles = el("div", "encoding-toggles");
        const total = el("p", "encoding-total");
        const status = immediate ? el("p", "encoding-row-status") : null;
        const buttons = PLACES.map((place, position) => {
            const button = el("button", "encoding-toggle");
            button.type = "button";
            button.append(el("small", "", String(place)), el("span", "encoding-toggle-bit"));
            button.addEventListener("click", () => {
                const bits = [...getBits()];
                bits[position] = bits[position] === "1" ? "0" : "1";
                setBits(bits.join(""));
                render();
                changed();
            });
            toggles.append(button);
            return button;
        });
        function render() {
            const bits = getBits();
            buttons.forEach((button, position) => {
                const on = bits[position] === "1";
                button.setAttribute("aria-pressed", String(on));
                button.setAttribute("aria-label", `${PLACES[position]}: ${on ? "ON" : "OFF"}`);
                button.classList.toggle("is-on", on);
                button.lastChild.textContent = on ? "1" : "0";
            });
            total.textContent = `Binary: ${bits} \u2022 Total: ${totalOf(bits)}`;
            if (status) {
                const result = letterStatus(bits, target);
                status.textContent = result.text;
                row.dataset.state = result.state;
            }
        }
        row.append(head, toggles, total);
        if (status) row.append(status);
        render();
        return { row, render };
    }

    const practiceRow = bitRow({ letter: "E", target: 5, getBits: () => state.practice,
        setBits: (bits) => { state.practice = bits; practiceFeedback.textContent = ""; practiceFeedback.dataset.tone = ""; } });
    $("#encoding-practice").append(practiceRow.row);
    $("#encoding-practice-check").addEventListener("click", () => {
        const correct = totalOf(state.practice) === 5;
        practiceFeedback.dataset.tone = correct ? "good" : "hint";
        practiceFeedback.textContent = correct
            ? "\u2713 Correct! 5 = 4 + 1, so E = 00101."
            : "Not quite yet. Check which place values add up to 5.";
    });

    const letterRows = [];
    const lettersHost = $("#encoding-letters");
    const example = el("div", "encoding-row is-example");
    example.setAttribute("role", "group");
    example.setAttribute("aria-label", "T = 20, worked example");
    const exampleHead = el("div", "encoding-row-head");
    exampleHead.append(el("span", "encoding-letter", "T"), el("span", "encoding-value", "= 20"));
    const exampleBits = el("div", "encoding-toggles");
    [..."10100"].forEach((bit, position) => {
        const cell = el("span", `encoding-toggle is-static${bit === "1" ? " is-on" : ""}`);
        cell.append(el("small", "", String(PLACES[position])), el("span", "encoding-toggle-bit", bit));
        exampleBits.append(cell);
    });
    example.append(exampleHead, exampleBits, el("p", "encoding-total", "Binary: 10100 \u2022 Total: 20"), el("p", "encoding-row-status", "Worked example"));
    lettersHost.append(example);
    for (const { index, letter, value } of letters) {
        const control = bitRow({ letter, target: value, immediate: true, getBits: () => state.letters[index],
            setBits: (bits) => { state.letters[index] = bits; } });
        letterRows.push(control);
        lettersHost.append(control.row);
    }

    let challengeRows = [];
    function renderChallenge() {
        challengeHost.replaceChildren();
        challengeRows = [...state.challenge.word].map((letter, position) => {
            const control = bitRow({ letter, target: letterValue(letter), immediate: true,
                getBits: () => state.challenge.bits[position], setBits: (bits) => { state.challenge.bits[position] = bits; } });
            challengeHost.append(control.row);
            return control;
        });
    }
    challengeInput.addEventListener("input", () => {
        const word = cleanWord(challengeInput.value);
        if (challengeInput.value !== word) challengeInput.value = word;
        if (word === state.challenge.word) return;
        state.challenge.bits = [...word].map((_letter, position) => state.challenge.bits[position] || EMPTY);
        state.challenge.word = word;
        renderChallenge();
        changed();
    });

    function renderChips(host, word, bitsAt) {
        host.replaceChildren();
        let complete = word.length > 0;
        [...word].forEach((letter, index) => {
            const bits = bitsAt(index);
            const done = bits === toBinary(letterValue(letter));
            if (!done) complete = false;
            const chip = el("span", `encoding-message-chip${done ? " is-done" : ""}`);
            chip.append(el("b", "", letter), el("span", "", done ? bits : "?????"));
            host.append(chip);
        });
        return complete;
    }

    function renderMessage() {
        renderChips(messageOutput, WORD, (index) => (index === 0 ? "10100" : state.letters[index]));
        const word = state.challenge.word;
        challengeMessage.hidden = !word;
        const complete = renderChips(challengeMessageBits, word, (index) => state.challenge.bits[index]);
        challengeMessageDone.textContent = complete ? `\u2713 You encoded ${word} in binary!` : "";
    }

    function renderCompletion() {
        completePanel.hidden = !completed;
        root.dataset.completed = String(completed);
        const allCorrect = missingAnswers(state).length === 0;
        finishFeedback.dataset.tone = "hint";
        finishFeedback.textContent = allCorrect && !completed && !loadedFor
            ? "All letters are correct! Sign in with your school account so your work can be saved and ticked off."
            : "";
    }

    function renderAll() {
        practiceRow.render();
        letterRows.forEach((control) => control.render());
        challengeInput.value = state.challenge.word;
        renderChallenge();
        renderMessage();
        renderCompletion();
    }

    function applyResponses(responses) {
        const source = responses && typeof responses === "object" ? responses : {};
        state.practice = isBits(source.practice) ? source.practice : EMPTY;
        for (const { index } of letters) state.letters[index] = isBits(source.letters?.[index]) ? source.letters[index] : EMPTY;
        const word = cleanWord(source.challenge?.word);
        state.challenge = { word, bits: [...word].map((_letter, position) => (isBits(source.challenge?.bits?.[position]) ? source.challenge.bits[position] : EMPTY)) };
    }

    function changed() {
        dirty = true;
        renderMessage();
        renderCompletion();
        if (!loadedFor) {
            setStatus("Sign in with your school account to save your answers.", "warn");
            return;
        }
        setStatus("Saving\u2026");
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { void autoSave(); }, 700);
    }

    function putProgress() {
        const email = loadedFor;
        const run = async () => {
            if (email !== loadedFor) return null;
            const response = await fetch(API_URL, {
                method: "PUT", cache: "no-store",
                headers: withHubAuthHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ responses: state })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            if (email !== loadedFor) return null;
            completed = Boolean(data.completed);
            renderCompletion();
            return data;
        };
        saveChain = saveChain.catch(() => {}).then(run);
        return saveChain;
    }

    async function autoSave() {
        clearTimeout(retryTimer);
        const wasCompleted = completed;
        try {
            const data = await putProgress();
            if (!data) return;
            dirty = false;
            if (wasCompleted && !completed) {
                setStatus("Saved. One of your answers changed, so the activity is no longer complete. Fix it and it will be ticked off again.", "warn");
            } else {
                setStatus(completed ? "Saved \u2713 Activity complete." : "Saved \u2713 Your answers are saved as you work.", "good");
            }
        } catch (error) {
            console.error("Could not save Encoding Binary answers", error);
            setStatus("Could not save your answers. Trying again\u2026", "error");
            retryTimer = setTimeout(() => { void autoSave(); }, 5000);
        }
    }

    async function loadProgress() {
        const request = ++loadRequest;
        const email = typeof getActiveHubEmail === "function" ? getActiveHubEmail() : "";
        if (typeof hasAllowedSignedInHubAccount !== "function" || !hasAllowedSignedInHubAccount() || !email) {
            loadedFor = "";
            completed = false;
            renderCompletion();
            setStatus("Sign in with your school account to save your answers. You can still practise.", "warn");
            return;
        }
        if (loadedFor === email) return;
        setStatus("Loading your saved answers\u2026");
        try {
            const response = await fetch(API_URL, { cache: "no-store", headers: withHubAuthHeaders() });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            if (request !== loadRequest) return;
            loadedFor = email;
            completed = Boolean(data.completed);
            if (dirty) {
                renderCompletion();
                changed();
            } else {
                applyResponses(data.responses);
                renderAll();
                // Answers saved before auto-ticking existed are re-saved so the Task List ticks them off.
                if (!completed && missingAnswers(state).length === 0) {
                    changed();
                    return;
                }
                setStatus(completed ? "Saved \u2713 Activity complete." : "Your answers are saved as you work.", completed ? "good" : "");
            }
        } catch (error) {
            console.error("Could not load Encoding Binary answers", error);
            if (request !== loadRequest) return;
            setStatus("Your saved answers could not be loaded. Refresh the page to try again.", "error");
        }
    }

    renderAll();
    window.addEventListener("hub-auth-state-changed", () => { void loadProgress(); });
    void loadProgress();
})();
