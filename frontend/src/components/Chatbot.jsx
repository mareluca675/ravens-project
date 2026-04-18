import React, { useState, useRef, useEffect } from 'react';

const styles = {
  container: {
    display: 'flex',
    height: 'calc(100vh - 56px)',
    background: '#0f1629',
    color: '#eee',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  chatPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #1a2744',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#e94560',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
  },
  headerTitle: {
    fontSize: '15px',
    fontWeight: 600,
  },
  headerSubtitle: {
    fontSize: '11px',
    color: '#888',
    marginTop: '2px',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  messageBubble: (isUser) => ({
    maxWidth: '75%',
    padding: '12px 16px',
    borderRadius: '12px',
    background: isUser ? '#1a2744' : '#111827',
    alignSelf: isUser ? 'flex-end' : 'flex-start',
    borderTopRightRadius: isUser ? '4px' : '12px',
    borderTopLeftRadius: isUser ? '12px' : '4px',
    lineHeight: '1.5',
    fontSize: '14px',
  }),
  messageMeta: (isUser) => ({
    fontSize: '10px',
    color: '#666',
    marginTop: '6px',
    textAlign: isUser ? 'right' : 'left',
  }),
  typing: {
    alignSelf: 'flex-start',
    padding: '10px 16px',
    background: '#111827',
    borderRadius: '12px',
    borderTopLeftRadius: '4px',
    fontSize: '14px',
    color: '#888',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  inputArea: {
    padding: '12px 16px',
    borderTop: '1px solid #1a2744',
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #1a2744',
    background: '#111827',
    color: '#eee',
    fontSize: '14px',
    outline: 'none',
  },
  sendBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: '#e94560',
    color: '#fff',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer',
  },
  sendBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  sidebar: {
    width: '280px',
    borderLeft: '1px solid #1a2744',
    padding: '20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    flexShrink: 0,
  },
  sidebarTitle: {
    fontSize: '13px',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  chip: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #1a2744',
    background: '#111827',
    color: '#ccc',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'left',
    lineHeight: '1.4',
    transition: 'border-color 0.2s, color 0.2s',
  },
};

const QUICK_ACTIONS = [
  'Ce este Legea apelor 107/1996?',
  'Cum raportez o deversare ilegală?',
  'Indicatori de calitate a apei',
  'Efectele microplasticelor',
  'Practici agricole sustenabile',
];

const WELCOME_MESSAGE = {
  sender: 'bot',
  text: 'Bună ziua! Sunt asistentul RAVENS, specializat în ecologie, legislația mediului și protecția cursurilor de apă din România. Cu ce vă pot ajuta?',
  time: new Date(),
};

function formatTime(date) {
  return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

function getResponse(message) {
  const lower = message.toLowerCase();

  if (lower.includes('legea apelor') || lower.includes('107/1996')) {
    return (
      'Legea apelor nr. 107/1996 este principalul act normativ care reglementează ' +
      'gospodărirea apelor în România. Aceasta stabilește cadrul juridic pentru ' +
      'protecția, conservarea și utilizarea durabilă a resurselor de apă. Legea ' +
      'definește regimul de autorizare pentru utilizarea apelor, obligațiile ' +
      'deținătorilor de instalații care pot afecta calitatea apei, precum și ' +
      'sancțiunile pentru încălcarea normelor de protecție a mediului acvatic. ' +
      'Autoritățile responsabile includ ANAR (Administrația Națională Apele Române) ' +
      'și Garda Națională de Mediu.'
    );
  }

  if (lower.includes('deversare') || lower.includes('raportez') || lower.includes('sesizare')) {
    return (
      'Pentru a raporta o deversare ilegală sau o poluare a cursurilor de apă, urmați acești pași:\n\n' +
      '1. Contactați Garda Națională de Mediu la numărul de urgență 021-312.48.85 sau ' +
      'prin Telverde 0800-800-723.\n' +
      '2. Sesizați ANAR (Administrația Națională Apele Române) la dispeceratul non-stop.\n' +
      '3. Apelați 112 dacă situația prezintă pericol imediat pentru sănătatea publică.\n' +
      '4. Documentați incidentul: fotografii, locație GPS, ora și descrierea poluantului.\n' +
      '5. Depuneți o sesizare scrisă la Agenția pentru Protecția Mediului din județul dvs.\n\n' +
      'Conform OUG 195/2005, orice cetățean are dreptul și obligația de a sesiza ' +
      'autoritățile competente asupra oricărei activități care afectează mediul.'
    );
  }

  if (lower.includes('calitate') || lower.includes('indicatori')) {
    return (
      'Principalii indicatori de calitate a apei monitorizați în România sunt:\n\n' +
      '- pH: valoarea optimă pentru ecosisteme acvatice este 6.5–8.5\n' +
      '- Oxigen dizolvat (OD): minimum 6 mg/l pentru clasa I de calitate\n' +
      '- CBO5 (Consum Biochimic de Oxigen): sub 3 mg/l pentru ape curate\n' +
      '- Azot total și fosfor total: indicatori ai eutrofizării\n' +
      '- Turbiditate: reflectă cantitatea de particule în suspensie\n' +
      '- Conductivitate electrică: indică nivelul de mineralizare\n' +
      '- Metale grele (Pb, Cd, Hg): monitorizate conform Directivei Cadru a Apei 2000/60/CE\n\n' +
      'ANAR clasifică apele de suprafață în 5 clase de calitate, de la clasa I ' +
      '(foarte bună) la clasa V (foarte degradată).'
    );
  }

  if (lower.includes('microplastic')) {
    return (
      'Microplasticele (particule sub 5 mm) reprezintă o problemă majoră pentru ' +
      'ecosistemele acvatice din România. Studii recente au identificat concentrații ' +
      'semnificative în Dunăre și afluenții săi. Efectele includ:\n\n' +
      '- Ingestia de către organisme acvatice, cu impact pe lanțul trofic\n' +
      '- Absorbția și transportul poluanților organici persistenți\n' +
      '- Perturbarea echilibrului ecosistemic al habitatelor bentice\n' +
      '- Contaminarea potențială a surselor de apă potabilă\n\n' +
      'Sursele principale sunt: deșeurile plastice degradate, fibrele textile din ' +
      'ape uzate, granulele din produse cosmetice și fragmentele din agricultură ' +
      '(folii, tuburi de irigații). Reducerea poluării cu microplastice necesită ' +
      'măsuri integrate de gestionare a deșeurilor și filtrare avansată a apelor uzate.'
    );
  }

  if (lower.includes('agricol') || lower.includes('fermier') || lower.includes('irigat')) {
    return (
      'Practici agricole sustenabile pentru protecția cursurilor de apă:\n\n' +
      '- Zone tampon vegetale: menținerea unei fâșii de vegetație de min. 5 m ' +
      'pe malurile râurilor pentru filtrarea scurgerilor agricole\n' +
      '- Agricultură de precizie: dozarea corectă a îngrășămintelor pe baza ' +
      'analizelor de sol pentru reducerea excesului de azot și fosfor\n' +
      '- Irigații eficiente: sisteme prin picurare care reduc consumul de apă cu 30–50%\n' +
      '- Rotația culturilor și culturi de acoperire pentru prevenirea eroziunii solului\n' +
      '- Managementul integrat al dăunătorilor pentru reducerea pesticidelor\n' +
      '- Compostarea și utilizarea îngrășămintelor organice în locul celor chimice\n\n' +
      'Aceste practici sunt încurajate prin subvenții APIA și programe AFIR ' +
      'în cadrul Politicii Agricole Comune (PAC) a UE.'
    );
  }

  if (lower.includes('anar')) {
    return (
      'ANAR (Administrația Națională „Apele Române") este instituția publică ' +
      'responsabilă cu gestionarea cantitativă și calitativă a resurselor de apă ' +
      'din România. Atribuțiile principale includ:\n\n' +
      '- Monitorizarea calității apelor de suprafață și subterane\n' +
      '- Emiterea avizelor și autorizațiilor de gospodărire a apelor\n' +
      '- Administrarea infrastructurii hidrotehnice naționale\n' +
      '- Prevenirea și combaterea inundațiilor\n' +
      '- Implementarea Directivei Cadru a Apei 2000/60/CE\n\n' +
      'ANAR funcționează prin 11 administrații bazinale și coordonează Sistemul ' +
      'Național de Monitoring al Apelor.'
    );
  }

  return (
    'Vă mulțumesc pentru întrebare. Pot oferi informații despre: legislația de mediu, ' +
    'raportarea poluării, calitatea apei, efectele poluanților și practici sustenabile. ' +
    'Reformulați întrebarea sau alegeți una din sugestiile rapide.'
  );
}

export default function Chatbot({ api }) {
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEnd = useRef(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  function handleSend(text) {
    const trimmed = (text || input).trim();
    if (!trimmed || isTyping) return;

    const userMsg = { sender: 'user', text: trimmed, time: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const botMsg = { sender: 'bot', text: getResponse(trimmed), time: new Date() };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 800);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.chatPanel}>
        <div style={styles.header}>
          <div style={styles.headerIcon}>R</div>
          <div style={styles.headerText}>
            <div style={styles.headerTitle}>RAVENS Ecologie Bot</div>
            <div style={styles.headerSubtitle}>Asistent AI pentru mediu și legislație</div>
          </div>
        </div>

        <div style={styles.messages}>
          {messages.map((msg, i) => (
            <div key={i} style={{ alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
              <div style={styles.messageBubble(msg.sender === 'user')}>
                {msg.text.split('\n').map((line, j) => (
                  <span key={j}>
                    {line}
                    {j < msg.text.split('\n').length - 1 && <br />}
                  </span>
                ))}
              </div>
              <div style={styles.messageMeta(msg.sender === 'user')}>
                {msg.sender === 'user' ? 'Utilizator' : 'RAVENS Bot'} &middot; {formatTime(msg.time)}
              </div>
            </div>
          ))}
          {isTyping && (
            <div style={styles.typing}>
              <span>RAVENS Bot scrie...</span>
              <span>...</span>
            </div>
          )}
          <div ref={messagesEnd} />
        </div>

        <div style={styles.inputArea}>
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Scrieți un mesaj..."
            disabled={isTyping}
          />
          <button
            style={{ ...styles.sendBtn, ...((!input.trim() || isTyping) ? styles.sendBtnDisabled : {}) }}
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
          >
            Trimite
          </button>
        </div>
      </div>

      <div style={styles.sidebar}>
        <div style={styles.sidebarTitle}>Sugestii Rapide</div>
        {QUICK_ACTIONS.map((text, i) => (
          <button
            key={i}
            style={styles.chip}
            onClick={() => handleSend(text)}
            disabled={isTyping}
            onMouseEnter={(e) => {
              e.target.style.borderColor = '#e94560';
              e.target.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.target.style.borderColor = '#1a2744';
              e.target.style.color = '#ccc';
            }}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
