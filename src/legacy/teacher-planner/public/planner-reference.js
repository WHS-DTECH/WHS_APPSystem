(() => {
  const reference = {
    standards: [
      'Te Tiriti o Waitangi partnership.',
      'Know the content and how to teach it.',
      'Know the learner and the learning process.',
      'Plan for and implement effective teaching and learning.',
      'Create and maintain supportive and safe learning environments.',
      'Assess, provide feedback, and report on learning.',
      'Engage in professional learning.',
      'Engage in productive professional relationships.'
    ],
    commitment: [
      'Me whakaatu i te ngākaunui ki te tikanga o te tangata whenuatanga me te hononga patui i raro o Te Tiriti o Waitangi i Aotearoa.',
      'Demonstrate commitment to tangata whenuatanga and Te Tiriti o Waitangi partnership in Aotearoa New Zealand.'
    ],
    elaborations: [
      ['Me mārama, ā, me mōhio ki te mana ahurei o te tangata whenua i Aotearoa nei.',
        'Understand and recognise the unique status of tangata whenua in Aotearoa NZ.'],
      ['Me mārama, ā, me whakaae ki ngā hītori, ki ngā tuku ihotanga, ki ngā reo me ngā ahurea o ngā hoa patui i raro o Te Tiriti o Waitangi.',
        'Understand and acknowledge the histories, heritages, languages and cultures of partners to Te Tiriti o Waitangi.'],
      ['Me whakamahi, ā, me whakawhanake i te reo me ngā tikanga Māori.',
        'Practise and develop the use of te reo and tikanga Māori.']
    ],
    reflectionGroups: [
      {
        mi: 'Te Hautū, te Ārahi', en: 'Leading',
        questions: [
          ['reflection1', 'E hia ngā whānau Māori he tamariki ā rātou i tō kura?',
            'How many Māori whānau have children at your school?'],
          ['reflection2', 'Ko ēhea whānau nō te/ngā iwi kāinga me ngā hapū o te rohe, ko ēhea whānau nō rohe kē?',
            'Are you able to identify which whānau have local iwi/hapū connections and which are from outside the area?'],
          ['reflection3', 'Ka pēhea tō whai kia rongo ngā ākonga katoa me ō rātou whānau nō te kura tonu rātou, kia hāneanea hoki tā rātou noho tahi ki te ‘ahurea’ o te kura (arā te āhua o ngā mahi o ngā whakahaere a te kura)?',
            'How do you ensure that all learners and their whānau feel that they belong and are comfortable with the ‘culture’ at your school (the way that you do things)?'],
          ['reflection4', 'He aha ō mahi hei whakatū, hei whakapūmau, hei whakakaha ake rānei i tō hononga ki te/ngā iwi kāinga, tae atu ki ngā hapū me ngā whānau o aua iwi?',
            'What are you doing to establish, sustain and/or strengthen your relationship with local iwi, hapū and whānau?'],
          ['reflection5', 'He take anō kua ara ake i āhua whakararu i tō hononga ki te/ngā iwi, ngā hapū me ngā whānau o te rohe? Ka aha kē koe ina ara ake anō taua tūmomo take?',
            'What issues, if any, have arisen that could have impacted on your relationship with local iwi, hapū and whānau this year? What would you do differently next time?'],
          ['reflection6', 'He pēhea rawa te kaha o tāu nā tautuhi i ngā koronga mō te katoa o te kura (te katoa rānei o te kāhui pouārahi o roto i te kura) mō te wāhi ki tēnei paerewa?',
            'To what extent do you define school-wide (and/or leadership/team-wide) expectations in relation to this standard?'],
          ['reflection7', 'E pēhea ana tō whai kia haere kōtui ngā mahi e mahi nei te kura me ngā mahere rapu mātauranga a ngā iwi/hapū, ngā whāinga tōmua hoki a ngā iwi mō ā rātou rangatahi?',
            'How do you align what happens in the school with iwi/hapū education plans and iwi priorities for their young people?']
        ]
      },
      {
        mi: 'Te Tautāwhi', en: 'Enabling',
        questions: [
          ['reflection8', 'Ka pēhea tō tautoko i ngā mātua, ngā whānau me ētahi atu kia āta whakatakoto whāinga e angitu ai ngā ākonga Māori?',
            'How do you support parents, whānau and others to develop goals around Māori student success?'],
          ['reflection9', 'He aha ō mahi e uru rawa ai ngā mātua, ngā whānau, ngā hapū me te hapori Māori ki te kawenga ake o ngā mahi i tō kura?',
            'What do you do to ensure that parents, whānau, hapū and the wider Māori community are active contributors to your school?'],
          ['reflection10', 'He aha ō mahi e āhei ai ngā ākonga katoa i tō kura ki te ako i te reo Māori ina hiahia rātou?',
            'How do you ensure that all learners at your school have access to learning te reo Māori?'],
          ['reflection11', 'He aha ō mahi e taea ai e ngā kaiako katoa te whakatutuki ngā hiahia o ngā ākonga Māori i runga anō i te ngākau māia?',
            'How do you ensure that all teachers are capable and confident in meeting the needs of Māori learners?'],
          ['reflection12', 'He pēhea nei te kaha o tō taunaha pūtea, rawa anō hoki, hei whakapakari ake i ngā kaimahi ki te whakatutuki i tēnei paerewa?',
            'To what extent do you resource staff development in relation to this standard?']
        ]
      },
      {
        mi: 'Te Tū hei Tauira', en: 'Role Modelling',
        questions: [
          ['reflection13', 'Ka pēhea tō whakaatu atu i tō uara nui ki te reo me ngā tikanga Māori i roto i ō mahi hautū, ā, i te whānuitanga atu o ngā kawenga i te kura?',
            'How do you show that you value te reo and tikanga Māori as part of your leadership, and across the school?'],
          ['reflection14', 'Ka pēhea koe e mōhio ai mēnā e hāpai ana, e manaaki ana te āhua o tō hautū me ō mahi whānui i ngā tikanga ā-iwi?',
            'How do you know if your leadership style and practices are culturally responsive?']
        ]
      },
      {
        mi: 'Ngā Kokenga ki Tua', en: 'Next Steps',
        questions: [
          ['reflection15', 'I runga i ō whakautu ki ngā pātai i runga nei, ka pēhea te āhua o ō mahi haere ake nei?',
            'What do your responses to the previous questions mean for you going forward?']
        ]
      }
    ],
    learningTypes: [
      ['workshops', 'Wānanga/papamahi/hui whakapakari', 'Workshops'],
      ['reading', 'Pānui kōrero ngaiotanga', 'Professional reading'],
      ['research', 'Mahi rangahau', 'Research'],
      ['conversations', 'Matapakinga ngaiotanga', 'Professional conversations'],
      ['cluster', 'Hui ā-kāhui', 'Cluster meeting'],
      ['feedback', 'Whakahokinga kōrero i muri i te mātakitanga', 'Observation feedback'],
      ['tertiary', 'Akoranga pae tuatoru', 'Tertiary study'],
      ['conferences', 'Whakarauikatanga/hui nui', 'Conferences'],
      ['online', 'Akoranga tuihono', 'Online learning'],
      ['mentoring', 'Ngā tohutohu mai/poipoinga a tētahi atu i a au', 'Coaching/mentoring'],
      ['observation', 'Mātakitanga ā-hoamahi', 'Peer observation'],
      ['inquiry', 'Tūhuratanga ā-kaiako', 'Teacher inquiry'],
      ['reflection', 'Arotake/huritao whaiaro', 'Self-evaluation/reflection'],
      ['group', 'Whai wāhi ki tētahi rōpū ngaiotanga', 'Participating in a professional group'],
      ['other', 'Tētahi atu', 'Other']
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = reference;
  else globalThis.plannerReference = reference;
})();
