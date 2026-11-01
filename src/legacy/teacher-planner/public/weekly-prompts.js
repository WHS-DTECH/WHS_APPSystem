(() => {
  'use strict';
  const prompts = {
    "1-1":  {
                "focus":  "Learning takes time",
                "reflection":  "What am I still learning?",
                "whakatauki":  "Ehara taku toa i te toa takitahi, engari he toa takitini. | My strength is not that of an individual, but that of the collective.",
                "value":  "Whanaungatanga\nLearning happens through connection with others",
                "vocabulary":  "Ako (to learn, teach)"
            },
    "1-2":  {
                "focus":  "Mistakes grow the brain",
                "reflection":  "What mistake taught me something?",
                "whakatauki":  "Whaia te iti kahurangi. | Seek the treasure you value most highly.",
                "value":  "Akoranga\nMistakes are part of learning.",
                "vocabulary":  "Ka taea e au (I can do it)"
            },
    "1-3":  {
                "focus":  "Progress over perfection",
                "reflection":  "Where have I improved recently?",
                "whakatauki":  "He kai kei aku ringa. | There is food at the end of my hands.",
                "value":  "Akoranga\nMistakes are part of learning.",
                "vocabulary":  "Whakapiki (improve)"
            },
    "1-4":  {
                "focus":  "Effort matters",
                "reflection":  "Where did effort make the difference?",
                "whakatauki":  "Mā te huruhuru ka rere te manu. | Adorn the bird with feathers so it can fly.",
                "value":  "Rangatiratanga\nEffort helps us achieve success.",
                "vocabulary":  "Ngana (try)"
            },
    "1-5":  {
                "focus":  "Ask good questions",
                "reflection":  "What question helped my learning?",
                "whakatauki":  "Nāu te rourou, nāku te rourou, ka ora ai te iwi. | With your basket and my basket, the people will thrive.",
                "value":  "Whanaungatanga\nLearning grows through collaboration and questioning.",
                "vocabulary":  "Pātai pai (good question)"
            },
    "1-6":  {
                "focus":  "Learning is uncomfortable",
                "reflection":  "When did I step outside my comfort zone?",
                "whakatauki":  "Ka pū te ruha, ka hao te rangatahi. | The old net is cast aside while the new net goes fishing.",
                "value":  "Akoranga\nGrowth requires courage to try new things.",
                "vocabulary":  "Māia (courage)"
            },
    "1-7":  {
                "focus":  "Persistence beats talent",
                "reflection":  "When did I keep going despite difficulty?",
                "whakatauki":  "Whāia te iti kahurangi, ki te tūohu koe me he maunga teitei. |  Pursue excellence; if you must bow, let it be to a lofty mountain.",
                "value":  "Rangatiratanga\nKeep striving when challenges arise.",
                "vocabulary":  "Manawanui (perseverance)"
            },
    "1-8":  {
                "focus":  "Reflect before reacting",
                "reflection":  "What can I learn from this challenge?",
                "whakatauki":  "Ko te pae tawhiti whāia kia tata. | Seek to bring distant horizons closer.",
                "value":  "Akoranga\nReflection helps us move closer to our goals.",
                "vocabulary":  "Whakaaro (thinking)"
            },
    "1-9":  {
                "focus":  "Improvement comes from feedback",
                "reflection":  "What feedback helped me grow?",
                "whakatauki":  "Mā whero, mā pango ka oti ai te mahi. | By red and black the work is completed.",
                "value":  "Whanaungatanga\nImprovement comes when people work and learn together.",
                "vocabulary":  "Urupare (feedback)"
            },
    "1-10":  {
                 "focus":  "Focus on what you can control",
                 "reflection":  "What is within my influence today?",
                 "whakatauki":  "He waka eke noa. | We are all in this canoe together.",
                 "value":  "Whanaungatanga\nEveryone contributes to success.",
                 "vocabulary":  "Arotahi (focus)"
             },
    "1-11":  {
                 "focus":  "Learning from setbacks",
                 "reflection":  "What challenge helped me become stronger or wiser?",
                 "whakatauki":  "Whakataukī:\nE kore te pātiki e hoki ki tōna puehu.\nA flounder does not return to the dust it came from.\n(We keep moving forward and learning from experience.).",
                 "value":  "Manaakitanga\nShowing kindness to ourselves when things don\u0027t go to plan helps us learn, recover, and keep moving forward.",
                 "vocabulary":  "Pakari (resilient, strong)"
             },
    "2-1":  {
                "focus":  "Every expert was once a beginner",
                "reflection":  "What skill am I developing?",
                "whakatauki":  "Whāia te mātauranga. | Pursue knowledge and understanding.",
                "value":  "Akoranga\nEvery new skill begins with learning. Growth comes from being willing to start as a beginner.",
                "vocabulary":  "Mātauranga (knowledge, learning)"
            },
    "2-2":  {
                "focus":  "Small steps count",
                "reflection":  "What small success can I celebrate?",
                "whakatauki":  "Ko te pae tawhiti whāia kia tata. | Seek to bring distant horizons closer.",
                "value":  "Manaakitanga\nSuccess is achieved through many small steps. Celebrate progress in yourself and others.",
                "vocabulary":  "Angitu (success)"
            },
    "2-3":  {
                "focus":  "Learn from others",
                "reflection":  "Who helped me learn this week?",
                "whakatauki":  "Nāu te rourou, nāku te rourou. | With your basket and my basket we all contribute.",
                "value":  "Whanaungatanga\nLearning is strengthened when we help others and accept help ourselves.",
                "vocabulary":  "Tautoko (support)"
            },
    "2-4":  {
                "focus":  "Resilience after setbacks",
                "reflection":  "How did I recover from a challenge?",
                "whakatauki":  "Kia kaha, kia māia, kia manawanui. | Be strong, be brave, be steadfast.",
                "value":  "Manaakitanga\nShowing kindness to ourselves and others helps us recover from challenges.",
                "vocabulary":  "Kia kaha (be strong)"
            },
    "2-5":  {
                "focus":  "Think about your thinking",
                "reflection":  "What learning strategy worked best?",
                "whakatauki":  "Mā te whakaaro ka mōhio. | Through thought and reflection comes understanding.",
                "value":  "Akoranga\nEffective learners stop, think, and evaluate which strategies help them learn best.",
                "vocabulary":  "Huritao (reflection)"
            },
    "2-6":  {
                "focus":  "Prepare before performing",
                "reflection":  "How did preparation improve outcomes?",
                "whakatauki":  "He kai kei aku ringa. | There is food at the end of my hands.",
                "value":  "Rangatiratanga\nSuccess often comes from preparation, planning, and personal responsibility.",
                "vocabulary":  "Whakarite (prepare)"
            },
    "2-7":  {
                "focus":  "Curiosity drives learning",
                "reflection":  "What am I curious about?",
                "whakatauki":  "Whaowhia te kete mātauranga. | Fill the basket of knowledge.",
                "value":  "Akoranga\nCuriosity motivates us to ask questions and discover new ideas.",
                "vocabulary":  "Pākiki (curiosity)"
            },
    "2-8":  {
                "focus":  "Embrace challenge",
                "reflection":  "Which challenge helped me grow?",
                "whakatauki":  "Whāia te iti kahurangi. | Pursue that which is precious and meaningful.",
                "value":  "Akoranga\nChallenges help us develop new skills and grow our confidence.",
                "vocabulary":  "Wero (challenge)"
            },
    "2-9":  {
                "focus":  "Learn from failure",
                "reflection":  "What would I do differently next time?",
                "whakatauki":  "E hinga ana te tētēkura, e ara ana te tētēkura. | When one fern frond falls, another rises to take its place.",
                "value":  "Manaakitanga\nMistakes and setbacks create opportunities for learning and improvement.",
                "vocabulary":  "Ako anō (learn again)"
            },
    "2-10":  {
                 "focus":  "Be adaptable",
                 "reflection":  "What adjustment improved my success?",
                 "whakatauki":  "Kāore te kumara e kōrero mō tōna ake reka. | The kūmara does not speak of its own sweetness.",
                 "value":  "Manaakitanga\nBeing adaptable means responding positively to change with humility and resilience.",
                 "vocabulary":  "Urutau (adapt)"
             },
    "3-1":  {
                "focus":  "Celebrate progress",
                "reflection":  "What can I do now that I couldn\u0027t before?",
                "whakatauki":  "Mā te huruhuru ka rere te manu. | Adorn the bird with feathers so it can fly.",
                "value":  "Whanaungatanga\nRecognising growth strengthens confidence and encourages others.",
                "vocabulary":  "Whakanui (celebrate)"
            },
    "3-2":  {
                "focus":  "Monitor understanding",
                "reflection":  "How do I know I really understand?",
                "whakatauki":  "Mā te whakaaro nui e hanga te whare. | Careful thought builds the house.",
                "value":  "Akoranga\nDeep learning happens when we check that we truly understand, not just remember.",
                "vocabulary":  "Mārama (understanding)"
            },
    "3-3":  {
                "focus":  "Set meaningful goals",
                "reflection":  "What is my next learning goal?",
                "whakatauki":  "Ko te pae tata whakamaua kia tina. | Secure today\u0027s goals before reaching for tomorrow\u0027s.",
                "value":  "Rangatiratanga\nEffective learners set clear targets and take ownership of achieving them.",
                "vocabulary":  "Whāinga (goal)"
            },
    "3-4":  {
                "focus":  "Persevere through uncertainty",
                "reflection":  "How did I keep moving forward?",
                "whakatauki":  "Kaua e mate wheke, mate ururoa. | Do not die like the octopus; die like the hammerhead shark.",
                "value":  "Kaitiakitanga\nLooking after our wellbeing helps us maintain effort through difficult times.",
                "vocabulary":  "Toitū (persist)"
            },
    "3-5":  {
                "focus":  "Learning requires practice",
                "reflection":  "What have I practised consistently?",
                "whakatauki":  "He toi whakairo, he mana tangata. | Excellence in craftsmanship reflects excellence in people.",
                "value":  "Akoranga\nRepeated practice helps build confidence, competence, and mastery.",
                "vocabulary":  "Parakatihi (practice)"
            },
    "3-6":  {
                "focus":  "Connections deepen learning",
                "reflection":  "What links can I make between ideas?",
                "whakatauki":  "Whaowhia te kete mātauranga. | Fill the basket of knowledge.",
                "value":  "Akoranga\nLearning becomes more meaningful when we connect ideas, people, and experiences.",
                "vocabulary":  "Hononga (connection)"
            },
    "3-7":  {
                "focus":  "Self-regulation matters",
                "reflection":  "How did I manage distractions?",
                "whakatauki":  "Mā pango, mā whero ka oti ai te mahi. | Through cooperation and balance the work is completed.",
                "value":  "Kaitiakitanga\nCaring for ourselves helps us stay focused, organised, and productive.",
                "vocabulary":  "Whakahaere whaiaro (self-management)"
            },
    "3-8":  {
                "focus":  "Seek alternative perspectives",
                "reflection":  "How might someone else view this?",
                "whakatauki":  "Nā tō rourou, nā taku rourou. | Through your contribution and mine, we all benefit.",
                "value":  "Whanaungatanga\nDifferent viewpoints strengthen understanding and enrich learning.",
                "vocabulary":  "Tirohanga rerekē (different perspective)"
            },
    "3-9":  {
                "focus":  "Confidence grows through action",
                "reflection":  "What did I achieve because I tried?",
                "whakatauki":  "Kia manawanui. | Be steadfast and determined.",
                "value":  "Rangatiratanga\nConfidence develops when we choose action rather than waiting until we feel ready.",
                "vocabulary":  "Whakamātau (give it a go)"
            },
    "3-10":  {
                 "focus":  "Reflect and celebrate growth",
                 "reflection":  "How have I grown this year?:",
                 "whakatauki":  "Whakatōkia te kākano kia puāwai. | Nurture the seed and it will blossom.",
                 "value":  "Akoranga\nReflection helps us recognise how much we have learned and achieved.",
                 "vocabulary":  "Tipuranga (growth)"
             },
    "4-1":  {
                "focus":  "Share your learning",
                "reflection":  "What is one thing I have learned this year that could help someone else?",
                "whakatauki":  "Ko te manu e kai ana i te miro nōna te ngahere; ko te manu e kai ana i te mātauranga nōna te ao. | The bird that feeds on the berry owns the forest; the bird that feeds on knowledge owns the world.",
                "value":  "Whanaungatanga\nSharing knowledge strengthens learning communities.",
                "vocabulary":  "Tuari (share)"
            },
    "4-2":  {
                "focus":  "Lead by example",
                "reflection":  "How have my actions positively influenced others this year?",
                "whakatauki":  "He rangatira mō āpōpō. | A leader for tomorrow.",
                "value":  "Rangatiratanga\nLeadership is demonstrated through everyday actions and choices.",
                "vocabulary":  "Arataki (lead)"
            },
    "4-3":  {
                "focus":  "Contribute to something bigger",
                "reflection":  "What contribution have I made to my class, school, whānau, or community?",
                "whakatauki":  "He waka eke noa. | We are all in this canoe together.",
                "value":  "Whanaungatanga\nEveryone has something valuable to contribute to a community.",
                "vocabulary":  "Koha (contribution)"
            },
    "4-4":  {
                "focus":  "Care for people and place",
                "reflection":  "How have I shown care for people, places, and resources around me?",
                "whakatauki":  "Toitū te whenua, toitū te tangata. | When the land is well, the people are well.",
                "value":  "Kaitiakitanga\nCaring for people, resources, and environments benefits everyone.",
                "vocabulary":  "Tiaki (care for)"
            },
    "4-5":  {
                "focus":  "Looking ahead",
                "reflection":  "What goal or aspiration will I carry forward into next year?",
                "whakatauki":  "Whāia te iti kahurangi, ki te tūohu koe me he maunga teitei. | Pursue excellence; if you bow, let it be to a lofty mountain.",
                "value":  "Rangatiratanga\nReflect on this year\u0027s growth while setting aspirations for the future.",
                "vocabulary":  "Anamata (future)"
            }
};
  if (typeof module !== 'undefined' && module.exports) module.exports = prompts;
  else globalThis.plannerWeeklyPrompts = prompts;
})();
