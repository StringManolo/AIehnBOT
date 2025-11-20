// ==UserScript==
// @name         AIehnBOT
// @namespace    https://github.com/StringManolo/AIehnBOT
// @version      2.0.2
// @description  Run ollama LLM consumer at foro.elhacker.net
// @author       StringManolo - https://github.com/StringManolo
// @match        https://foro.elhacker.net/*
// @grant        none
// ==/UserScript==

/* Previous commentary is to use this script as a browser extension do not touch */




/* EXPLICACION DE COMO USAR EL SCRIPT Y LAS OPCIONES DISPONIBLES para AIehnBOT.js 2.0: 
 

 
  1. DIRECTAMENTE SOBRE foro.elhacker.net metiendo el <script src="./bot.js"></script> en el código
    * Esto solo lo puede hacer el admin del elhacker.net
    Configuración de variables necesaria:
      RUN_FROM_GREASYMONKEY = false; 
      RUN_ONLY_AT_TEST_SUBFORUM = false;  // true para debug de seguridad
      RUN_ONLY_ON_LOGGED_IN_USERS = true;
      RUN_AT_POST_FORUM = false;
      SCROLL_TO_BOT_MESSAGE = false;
      RUNNING_FORUM_IN_LOCAL_SERVER = false;
      * Si alguna de estas opciones no está así, puede afectar negativamente al foro.


  2. USANDO UNA EXTENSIÓN DE NAVEGADOR.
    * Puedes usar el navegador Cromite - https://github.com/uazo/cromite/ (disponible en Android)
    * Puedes usar la extensión para tu navegador Violentmonkey - https://github.com/Violentmonkey/Violentmonkey 
     Configuración de variables necesaria:
       RUN_FROM_GREASYMONKEY = true;
       RUN_ONLY_AT_TEST_SUBFORUM = false;
       RUN_ONLY_ON_LOGGED_IN_USERS = false;
       RUNNING_FORUM_IN_LOCAL_SERVER = false;
       * La pagina de configuración se tiene que activar con un botón antes de usarla
       * Esto es debido a limites de las extensiones
       * Si quieres correr el bot sin cuenta de foro.elhacker.net, comenta o borra el siguiente código de este archivo (esta abjo de todo):
         if (!localStorage.getItem("llmBotEnabled")) {
           return;
         }
 


  3. EN UN SERVIDOR LOCAL
    * Si tienes acceso a un servidor local que sirva la web de foro.elhacker.net
    * Correlo en el puerto 8000
    * Yo por ejemplo sirvo páginas státicas editadas para debug en local de este script
    Configuración de variables necesaria:
      RUN_FROM_GREASYMONKEY = false;
      RUN_ONLY_AT_TEST_SUBFORUM = false;
      RUNNING_FORUM_IN_LOCAL_SERVER = true;
      RUN_ONLY_ON_LOGGED_IN_USERS = false;


  TODOS.
   * UNA VEZ CONFIGURADO EL SCRIPT, VE A https://foro.elhacker.net/profile.html
   * Pincha la opción de la izquierda Configurar LLM
   * Marca la casilla de Habilitar Bot y dale al botón de guardar
   * Listo, ve a cualquier tema y el bot respondera

*/



const RUN_FROM_GREASYMONKEY = false;

// Avoid running the bot 2 times under GreaseMonkey
if (RUN_FROM_GREASYMONKEY) {
  runBot();
} else {
  window.addEventListener("load", () => {
    runBot();
  });
}

function runBot() { 
  /* Config Vars */
  const RUN_ONLY_ON_LOGGED_IN_USERS = true;
  const RUN_ONLY_AT_TEST_SUBFORUM = false; // for debug of markdown and xss
  const RUN_AT_POST_FORUM = false; // post.html is the responses edition to topics
  const RUN_AT_PROFILES_PAGES = false; // Avoid answers at /profiles/
  const BOT_NAME = "AIehnBOT";
  const BOT_FORUM_MESSAGES_TO_DISPLAY = 1;
  let SCROLL_TO_BOT_MESSAGE = false;
  let BOT_FORUM_IMAGE_URL = "https://foro.elhacker.net/Themes/converted/selogo.jpg"
  const SHOW_GENERANDO_RESPUESTA_STRING = false; // Not working ???
  let BOT_FORUM_SIGNATURE = "Esta respuesta se ha generado por inteligencia artificial"
  let BOT_CONTEXT =`Eres ${BOT_NAME}, un experto en ciberseguridad, hacking y tecnología con amplios conocimientos técnicos. Eres miembro activo del foro elhacker.net`;
  let BOT_RULES = `Responde como un experto en informática y hacking:
  - Proporciona información técnica precisa y útil
  - Si es relevante, aporta perspectiva de seguridad informática
  - Mantén un tono de compañero del foro, natural y accesible
  - Responde en español
  - Sé conciso pero informativo
  - No menciones que eres una IA`
  const API_ENDPOINT = "https://api.elhacker.net/api/chat";
  const API_MODEL = "gemma3:27b-it-fp16";
  const API_ROL = "user";
  const BLOCKED_URL = 'about:blank#blocked'; 
  const RUNNING_FORUM_IN_LOCAL_SERVER = false; // swap urls from https://foro.elhacker.net to http://localhost:8000 for development


/* functions */
  const detectTextPlusMarkdownCode = (text) => {
    const regex = /(```+)([a-zA-Z0-9\+]*)\n?([\s\S]*?)\1/g;
    const element = [];
    let lastIndex = 0;
    let match;
    let count = { text: 0, codigo: 0 };

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        count.text++;
        element.push({
          type: 'text',
          name: `text_${count.text}`,
          content: text.slice(lastIndex, match.index),
          raw: text.slice(lastIndex, match.index)
        });
      }

      count.codigo++;
      element.push({
        type: 'codigo',
        name: `block_${count.codigo}`,
        content: match[3],
        raw: match[0],
        separator: match[1],
        language: match[2] || 'text',
        numBackticks: match[1].length
      });

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      count.text++;
      element.push({
        type: 'text',
        name: `text_${count.text}`,
        content: text.slice(lastIndex),
        raw: text.slice(lastIndex)
      });
    }

    const result = {};
    element.forEach(item => {
      result[item.name] = item.content;
    });

    return {
      element,
      result,
      sumary: {
        totalBlocks: count.codigo,
        totalTexts: count.text,
        totalElements: element.length
      }
    };
  };

  const escapeHtml = (str) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const replaceDangerousURLByHttpsEncoded = (dangURL) => {
    if (!dangURL || typeof dangURL !== 'string') {
      return BLOCKED_URL;
    }

    let cleanUrl = dangURL.trim();
    if (cleanUrl === '') {
      return BLOCKED_URL;
    }

    if (/^(javascript:|data:|vbscript:|file:|blob:|ftp:)/i.test(cleanUrl)) {
      return BLOCKED_URL;
    }

    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }

    try {
      const urlObj = new URL(cleanUrl);

      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return BLOCKED_URL;
      }

      if (!urlObj.hostname || urlObj.hostname.includes('..')) {
        return BLOCKED_URL;
      }

      if (isLocalHost(urlObj.hostname)) {
        return BLOCKED_URL;
      }

      const hostname = encodeURIComponent(urlObj.hostname);
      const port = urlObj.port ? `:${urlObj.port}` : '';
      const path = encodeURI(urlObj.pathname + urlObj.search + urlObj.hash)
        .replace(/%20/g, '+')
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');

      return `${urlObj.protocol}//${hostname}${port}${path}`;
    } catch (error) {
      return BLOCKED_URL;
    }
  };

  const isLocalHost = (hostname) => {
    if (!hostname) return true;

    const host = hostname.toLowerCase();

    if (host === 'localhost' ||
      host === 'local.host' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '0.0.0.0') {
      return true;
    }

    if (isPrivateIP(host)) {
      return true;
    }

    return false;
  };

  const isPrivateIP = (ip) => {
    if (ip === '::1' || ip === '0.0.0.0') return true;
    const privateIPPatterns = [
      /^10\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i,
      /^172\.(1[6-9]|2\d|3[0-1])\.(\d{1,3})\.(\d{1,3})$/i,
      /^192\.168\.(\d{1,3})\.(\d{1,3})$/i,
      /^169\.254\.(\d{1,3})\.(\d{1,3})$/i,
      /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i,
      /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.(\d{1,3})\.(\d{1,3})$/i,
      /^fc00:/i,
      /^fd00:/i,
      /^fe80:/i,
      /^::1$/i,
      /^::ffff:(0:)?10\./i,
      /^::ffff:(0:)?172\.(1[6-9]|2\d|3[0-1])\./i,
      /^::ffff:(0:)?192\.168\./i,
      /^::ffff:(0:)?169\.254\./i,
      /^::ffff:(0:)?127\./i
    ];

    return privateIPPatterns.some(pattern => pattern.test(ip));
  };

  const processCodeBlock = (content, language = 'text') => {
    const escapedContent = escapeHtml(content);
    const escapedLanguage = escapeHtml(language);
    
    // Para mantener compatibilidad con GeSHi, usamos un único li como hace SMF
    // pero preservamos la numeración de líneas dividiendo el contenido
    const lines = escapedContent.split('\n');
    
    // Eliminar líneas vacías al final
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    
    // Construir el contenido con saltos de línea preservados
    const formattedContent = lines.map(line => line === '' ? ' ' : line).join('\n');
    
    // Determinar la clase correcta para GeSHi
    let geshiClass = language;
    if (language === 'js') geshiClass = 'javascript';
    if (language === 'py') geshiClass = 'python';
    if (language === 'txt') geshiClass = 'text';
    
    return `
<div class="codeheader">Código${language !== 'text' ? `: ${escapedLanguage}` : ''}</div>
<pre class="${geshiClass} geshi" style="font-family:monospace;"><ol><li style="font-weight: normal; vertical-align:top;"><div style="font: normal normal 1em/1.2em monospace; margin:0; padding:0; background:none; vertical-align:top;">${formattedContent}</div></li></ol></pre>`;
  };

  const replaceMarkdownByHTML = (markdown) => {
    // Si es un bloque de código completo, procesarlo de manera especial
    const codeBlockRegex = /^```([a-zA-Z0-9\+]*)\n?([\s\S]*?)```$/;
    const codeMatch = markdown.match(codeBlockRegex);

    if (codeMatch) {
      const language = codeMatch[1] || 'text';
      const content = codeMatch[2];
      return processCodeBlock(content, language);
    }

    let safeText = escapeHtml(markdown);

    // Procesar código inline
    safeText = safeText.replace(/`([^`]+)`/g, '<code>$1</code>');

    let processed = safeText
      .replace(/^\s*(?:---|\*\*\*)\s*$/gm, '<hr>')
      .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
      .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
      .replace(/\+\+(.*?)\+\+/g, '<span style="text-decoration: underline">$1</span>')
      .replace(/^>\s*(.+)$/gm, '<blockquote>$1</blockquote>');

    processed = processed
      .split('\n')
      .map(line => {
        if (line.match(/^\s*[-*]\s+/)) {
          const content = line.replace(/^\s*[-*]\s+/, '');
          return `<li>${content}</li>`;
        }
        return line;
      })
      .join('\n')
      .replace(/(<li>.*?<\/li>)(\s*<li>)/gs, '$1$2')
      .replace(/(<li>.*?<\/li>)(\s*<li>.*?<\/li>)+/gs, match => {
        return `<ul>${match}</ul>`;
      })
      .replace(/<\/ul>\s*<ul>/g, '');

    processed = processed
      .replace(/!\[([^\]]*?)\]\(\s*([^)]+?)\s*\)/g, (match, alt, url) => {
        const safeUrl = replaceDangerousURLByHttpsEncoded(url);
        return `<img src="${safeUrl}" alt="${alt}" style="max-width: 100%; height: auto;">`;
      })
      .replace(/\[([^\]]+?)\]\(\s*([^)]+?)\s*\)/g, (match, text, url) => {
        const safeUrl = replaceDangerousURLByHttpsEncoded(url);
        return `<a href="${safeUrl}" rel="nofollow noopener noreferrer" target="_blank">${text}</a>`;
      });

    return processed;
  };

  const LLMParser = (untrustedText) => {
    const { element } = detectTextPlusMarkdownCode(untrustedText);
    const parsedElements = element.map(item => {
      if (item.type === 'codigo') {
        return processCodeBlock(item.content, item.language);
      } else {
        return replaceMarkdownByHTML(item.raw);
      }
    });

    return parsedElements.join('');
  };

  const LLMParserStream = (untrustedText, isFinalChunk = false) => {
    let processedText = escapeHtml(untrustedText);
    
    // Solo procesar código inline básico durante el streaming
    processedText = processedText.replace(/`([^`]+)`/g, '<code>$1</code>');
    processedText = processedText.replace(/\n/g, '<br>');

    if (isFinalChunk) {
      // Al final, aplicar el procesamiento completo de markdown
      processedText = replaceMarkdownByHTML(untrustedText);
    }

    return processedText;
  };

  /* SCRIPT FUNCTIONS */
  const isUserLoggedOut = () => {
    const html = document.documentElement.outerHTML;
    const regex = /<a href="https:\/\/foro\.elhacker\.net\/logout\.html;sesc=([a-z0-9]{32})/;
    if (html.match(regex)) {
      return false;
    }
    
    return true;
  }

  const isTestSubforum = () => {
    if (/^https:\/\/foro\.elhacker\.net\/test(\/.*)?$/.test(window.location.href)) {
      return true;
    } 
    
    return false;
  }

  const isUserAtProfilePage = () => {
    if (/^https:\/\/foro\.elhacker\.net\/profile\.html$/.test(window.location.href)) {
      return true;
    }

    return false;
  }

  const isProfilesPage = () => {
    if (/^https:\/\/foro\.elhacker\.net\/profiles(\/.*)?$/.test(window.location.href)) {
     return true;
   }

    return false;
  }

  const isUserAtResponsePage = () => {
    if (/^https:\/\/foro\.elhacker\.net\/post\.html$/.test(window.location.href)) {
      return true;
    }

    return false;
  }

  const isUserAtConfigLLMPage = () => {
    if (/^https:\/\/foro\.elhacker\.net\/profile\.html\#llmBotConfig$/.test(window.location.href)) {
      return true;
    }
    return false;
  }


  const Parser = {};
  Parser.sanitizeURL = replaceDangerousURLByHttpsEncoded;
  Parser.htmlToEntities = escapeHtml;
  Parser.markdownToHTML = LLMParser;

  const extractForumData = () => {
    const topicTitle = document.querySelector('tr.titlebg td:nth-child(2)')?.textContent || 'Tema del foro';
    const messages = [];
    const messageContainers = document.querySelectorAll('td.windowbg, td.windowbg2');

    messageContainers.forEach((container, index) => {
      const authorElement = container.querySelector('b a');
      const contentElement = container.querySelector('.post');
      if (authorElement && contentElement) {
        const author = authorElement.textContent.trim();
        const content = contentElement.textContent.trim();

        if (content && !content.includes('Mensaje generado por IA')) {
          messages.push({ author: author, content: content});
        }
      }
    });

    return {
      topicTitle,
      messages
    };
  };

  const buildLLMContext = (forumData) => {
    const { topicTitle, messages } = forumData;
    const context = `${BOT_CONTEXT}

    Tema actual: "${topicTitle}"

    Conversación hasta ahora:
    ${messages.map(msg => `${msg.author}: ${msg.content}`).join('\n\n')}

    ${BOT_RULES}`;

    return {
      context: context,
      messageCount: messages.length
    };
  };

  const queryAPI = async (prompt, onChunk, onComplete) => {
    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: API_MODEL,
          messages: [{ role: API_ROL, content: prompt }],
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          onComplete(fullResponse);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;

          try {
            const parsed = JSON.parse(line);
            if (parsed.message && parsed.message.content !== undefined) {
              const chunk = parsed.message.content;
              fullResponse += chunk;
              onChunk(chunk);
            }
          } catch (err) {
            console.warn(`[${BOT_NAME}-debug]Error parseando chunk JSON:
${err}
Línea: ${line}i`
            )
          }
        }
      }
    } catch (err) {
      console.error(`[${BOT_NAME}-debug]Error al consultar la API en modo stream:
      ${err}
      `);
      throw err;
    }
  }

  const createPlaceholderElement = () => {
    const now = new Date();
    const dateString = now.toLocaleDateString('es-ES');
    const timeString = now.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'});
    const topicTitle = document.querySelector('tr.titlebg td:nth-child(2)')?.textContent || 'Tema del foro';

    const placeholderElement = document.createElement('tr');
    placeholderElement.innerHTML = `
      <td style="padding: 1px 1px 0 1px;">
        <a name="msg${Date.now()}"></a>
        <table width="100%" cellpadding="3" cellspacing="0" border="0">
          <tbody>
            <tr>
              <td style="background-color: #f8f8f8;">
                <table width="100%" cellpadding="5" cellspacing="0" style="table-layout: fixed;">
                  <tbody>
                    <tr>
                      <td valign="top" width="16%" rowspan="2" style="overflow: hidden;">
                        <b><a href="javascript:void(0)" title="Ver perfil de ${BOT_NAME}">${BOT_NAME}</a></b>
                        <div class="smalltext"><br>
                          <img src="https://foro.elhacker.net/Themes/converted/images/useroff.gif" alt="Desconectado" border="0" align="middle"><span class="smalltext"> Desconectado</span><br><br>
                          Mensajes: ${BOT_FORUM_MESSAGES_TO_DISPLAY}<br><br>
                          <div style="overflow: auto; width: 100%;">
                            <img src="${BOT_FORUM_IMAGE_URL}" alt="" class="avatar" border="0" style="max-width: 100px;">
                          </div><br>
                          Bot Experto en Seguridad<br><br>
                          <a href="javascript:void(0)"><img src="https://foro.elhacker.net/Themes/converted/images/icons/profile_sm.gif" alt="Ver Perfil" title="Ver Perfil" border="0"></a>
                        </div>
                      </td>
                      <td valign="top" width="85%" height="100%">
                        <table width="100%" border="0">
                          <tbody>
                            <tr>
                              <td align="left" valign="middle"><a href="javascript:void(0)"><img src="https://foro.elhacker.net/Themes/converted/images/post/xx.gif" alt="" border="0"></a></td>
                              <td align="left" valign="middle">
                                <b><a href="javascript:void(0)">Re: ${Parser.htmlToEntities(topicTitle)}</a></b>
                                <div class="smalltext">« <b>Respuesta en:</b> ${dateString}, ${timeString} »</div>
                              </td>
                              <td align="right" valign="bottom" height="20" nowrap="nowrap" style="font-size: smaller;">
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <hr width="100%" size="1" class="hrcolor">
                        <div class="post" style="overflow: auto; width: 100%;">
                          <div id="ai-stream-content" style="min-height: 20px; white-space: pre-wrap;">${SHOW_GENERANDO_RESPUESTA_STRING ? "Generando respuesta ...\n" : ""}</div>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td valign="bottom" class="smalltext" width="85%">
                        <table width="100%" border="0" style="table-layout: fixed;">
                          <tbody>
                            <tr>
                              <td align="left" colspan="2" class="smalltext" width="100%">
                              </td>
                            </tr>
                            <tr>
                              <td align="left" valign="bottom" class="smalltext">
                              </td>
                              <td align="right" valign="bottom" class="smalltext">
                                <img src="https://foro.elhacker.net/Themes/converted/images/ip.gif" alt="" border="0">
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <hr width="100%" size="1" class="hrcolor">
                        <div style="overflow: auto; width: 100%; padding-bottom: 3px;" class="signature">
                          <em>${BOT_FORUM_SIGNATURE}</em>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    `;
    return placeholderElement;
  }

  const insertMessageToForum = (messageElement, numMensajesReales) => {
    let insertionPoint = null;
    let estrategiaUsada = null;
    const messageAnchors = document.querySelectorAll('a[name^="msg"]');

    if (numMensajesReales > 1 && messageAnchors.length > 0) {
      const lastAnchor = messageAnchors[messageAnchors.length - 1];
      insertionPoint = lastAnchor.closest('tr');
      if (insertionPoint) {
        estrategiaUsada = 1;
      }
    }

    if (!insertionPoint) {
      const allMessageTables = document.querySelectorAll('table.bordercolor');

      for (let table of allMessageTables) {
        const hasPost = table.querySelector('.post');
        const hasWindowbg = table.querySelector('.windowbg, .windowbg2');
        const isSimilarMessages = table.closest('.tborder') &&
                                 table.previousElementSibling &&
                                 table.previousElementSibling.querySelector('.titlebg');

        if (hasPost && hasWindowbg && !isSimilarMessages) {
          const lastMessageRow = table.querySelector('tr:last-child');
          if (lastMessageRow) {
            insertionPoint = lastMessageRow;
            estrategiaUsada = 4;
            break;
          }
        }
      }
    }

    if (!insertionPoint) {
      return false;
    }

    insertionPoint.parentNode.insertBefore(messageElement, insertionPoint.nextSibling);

    if (SCROLL_TO_BOT_MESSAGE) {
      setTimeout(() => {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }

    return true;
  }

  const appendStreamContent = (contentElement, content) => {
    const streamContainer = contentElement.querySelector('#ai-stream-content');
    if (!streamContainer) return;

    const processedContent = LLMParserStream(content, false);

    if (streamContainer.innerHTML === (SHOW_GENERANDO_RESPUESTA_STRING ? "Generando respuesta ...\n" : "")) {
      streamContainer.innerHTML = processedContent;
    } else {
      streamContainer.innerHTML += processedContent;
    }

    streamContainer.scrollTop = streamContainer.scrollHeight;

    return streamContainer;
  }

  const applyFinalMarkdown = (contentElement) => {
    const streamContainer = contentElement.querySelector('#ai-stream-content');
    if (!streamContainer) return;

    const markdownText = streamContainer.innerText || streamContainer.textContent;
    const finalHTML = Parser.markdownToHTML(markdownText);

    streamContainer.innerHTML = finalHTML;
  }

  const generateResponseStream = async (contextData, placeholderElement) => {
    let streamContainer = null;

    try {
      const { context, messageCount } = contextData;

      if (!insertMessageToForum(placeholderElement, messageCount)) {
        return false;
      }

      streamContainer = placeholderElement.querySelector('#ai-stream-content');

      await queryAPI(context, (chunk) => {
        appendStreamContent(placeholderElement, chunk);
      }, (fullResponse) => {
        applyFinalMarkdown(placeholderElement);
      });

      return true;
    } catch (err) {
      if (placeholderElement && placeholderElement.parentNode) {
        placeholderElement.parentNode.removeChild(placeholderElement);
      }

      console.error(`[${BOT_NAME}-debug]Detalles del error: ${err.message}`);
      return false;
    }
  }


  /* Profile.html functions: */
  const inyectNewOptionAtProfilePage = () => {   
    const menuLinks = document.querySelectorAll('a');
    let personalMsgLink = null;
      
    for (let link of menuLinks) {
      if (link.textContent.includes("Configuración de Mensajes Personales") || link.textContent.includes("Configuraci&oacute;n de Mensajes Personales")) {
        personalMsgLink = link;
        break;
      }
    }
						

    if (personalMsgLink) {
      const listItem = personalMsgLink.parentNode;
      const newOption = document.createElement('a');
      newOption.href = RUNNING_FORUM_IN_LOCAL_SERVER ? "http://localhost:8000/index.html#llmBotConfig" : 'https://foro.elhacker.net/profile.html#llmBotConfig';
      newOption.textContent = 'Configurar LLM';
      newOption.className = 'smalltext';

      listItem.appendChild(newOption);
    }
  }




  const escapeText = (text) => {
  if (typeof text !== 'string') return text;
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    //.replace(/\//g, '&#x2F;')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\f/g, '\\f');

};

const inyectLLMOptionsPage = () => {
  const formatCurrentDate = () => {
      const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

    const now = new Date();
    const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    let formattedDate = now.toLocaleDateString('es', dateOptions)
      .replace(" de", "")
      .replace(" de", "");
    const month = formattedDate.split(" ")[1];
    formattedDate = formattedDate.replace(month, capitalize(month));
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = now.getHours() >= 12 ? 'pm' : 'am';
    return `${formattedDate}, ${hours}:${minutes} ${ampm}`;
  };


    const botPromptPlaceholder = escapeText(localStorage.getItem('llmBotPrompt') || BOT_CONTEXT);
    const botImageURL = escapeText(localStorage.getItem("llmBotImage") || BOT_FORUM_IMAGE_URL);
    const botSignature = escapeText(localStorage.getItem("llmBotSignature") || BOT_FORUM_SIGNATURE);

    document.open();
    document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Configuración LLM Bot</title>
        <style>
            html {
              text-size-adjust: none;
            }
            body {
                font-family: Verdana, Arial, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f5f5f5;
                color: #005177;
            }
            .bordercolor {
                border: 1px solid #000000;
            }
            .catbg {
                background-color: #444444;
                color: white;
                padding: 5px;
                font-weight: bold;
            }
            .windowbg2 {
                background-color: #BCD1DC;
            }
            .titlebg {
                background-color: #444444;
                color: white;
                font-weight: bold;
                padding: 5px;
            }
            .config-container {
                width: 95%;
                margin: 20px auto;
                background-color: white;
                border: 1px solid #000000;
            }
            .config-header {
                background-color: #444444;
                color: white;
                padding: 10px;
                font-weight: bold;
                font-size: 14px;
                margin-bottom: 10px;
            }
            .form-group {
                /*margin-bottom: 2px;*/
                padding-left: 10px;
                padding-right: 10px;
            }
            #promptDiv, #imageDiv, #signatureDiv {
                margin-top: 12px;
            }
            #promptDiv {
                margin-top: 16px;
            }
            label {
                display: block;
                /* margin-bottom: 5px; */
                font-weight: bold;
                color: #005177;
            }
            input[type="checkbox"] {
                margin-right: 10px;
            }
            textarea, input[type="text"] {
                width: 100%;
                padding: 8px;
                border: 1px solid #ddd;
                border-radius: 4px;
                box-sizing: border-box;
                font-family: Verdana, Arial, sans-serif;
                font-size: 12px;
            }
            .button-group {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
                padding: 10px;
                background-color: #BCD1DC;
            }
            
            /* --- ESTILOS DE BOTONES PERSONALIZADOS --- */
            .pixel-button {
                padding: 8px 15px 8px 35px; /* Padding a la izquierda para el icono */
                border: 1px solid #000000; /* Borde negro */
                border-radius: 15px; /* Bordes redondeados */
                cursor: pointer;
                font-weight: bold;
                font-family: Verdana, Arial, sans-serif;
                font-size: 12px;
                color: #000000; /* Texto negro */
                /* Simulación de degradado */
                background: linear-gradient(to bottom, #FFFFFF 0%, #E0E0E0 50%, #C0C0C0 100%);
                background-repeat: no-repeat;
                background-position: 8px center; /* Posición del icono */
                background-size: 20px 20px; /* Tamaño del icono */
                transition: background 0.1s;
                box-shadow: 1px 1px 2px rgba(0,0,0,0.3); /* Sombra sutil */
            }

            #saveBtn {
                /* Icono de disquete (Guardar) */
                background-image: url('https://img.icons8.com/color/48/000000/save--v1.png'); /* Icono Save (Disquete) */
            }

            #resetBtn {
                /* Icono de flecha circular (Resetear) */
                background-image: url('https://img.icons8.com/color/48/000000/restart--v1.png'); /* Icono Restart (Flecha circular) */
            }

/*
            .pixel-button:hover {
                background: linear-gradient(to bottom, #EEEEEE 0%, #D0D0D0 50%, #B0B0B0 100%);
            }
*/

            .smalltext {
                font-size: 11px;
            }
            .hrcolor {
                color: #BCD1DC;
                background-color: #BCD1DC;
                height: 1px;
                border: 0;
            }
        </style>
    </head>
    <body>
        <table width="95%" cellspacing="1" cellpadding="0" border="0" align="CENTER" class="bordercolor" bgcolor="#000000">
            <tr>
                <td>
                    <table border="0" width="100%" cellpadding="0" cellspacing="0">
                        <tr class="windowbg2">
                            <td valign="top" align="center" width="468" height="60">
                                <a href="https://www.elhacker.net" target="_blank">
                                    <img src="https://foro.elhacker.net/Themes/converted/selogo.jpg" border="0" width="468" height="60" alt="elhacker.net">
                                </a>
                            </td>
                            <td width="68" height="60" align="center" valign="top">
                                <img src="https://foro.elhacker.net/Themes/converted/der_logo.jpg" width="69" height="60" alt="cabecera">
                            </td>
                            <td align="center" width="100%" valign="middle">
                                <font size="2" style="font-family: Verdana; font-size: 12px;">
                                    Configuración LLM Bot
                                </font>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
            <tr align="center" valign="middle" bgcolor="#444444" class="windowbg2">
                <td class="catbg">
                    <div class="nav">
                        <ul class="artmenu" style="list-style: none; padding: 0; margin: 0;">
                            | <a href="https://foro.elhacker.net/index.php" style="color: white;">Foro</a> |
                            <a href="https://www.elhacker.net/" style="color: white;">Web</a> |
                            <a href="https://blog.elhacker.net/" style="color: white;">Blog</a> |
                            <a href="https://foro.elhacker.net/help.html" style="color: white;">Ayuda</a> |
                            <a href="https://foro.elhacker.net/search.html" style="color: white;">Buscar</a> |
                            <a href="https://foro.elhacker.net/profile.html" style="color: white;">Perfil</a> |
                            <a href="https://foro.elhacker.net/pm.html" style="color: white;">Mis Mensajes</a> |
                            <font size="1">${formatCurrentDate()}</font>
                        </ul>
                    </div>
                </td>
            </tr>
        </table>

        <br>

        <div class="config-container">
            <div class="config-header">
                <img src="https://foro.elhacker.net/Themes/converted/images/icons/profile_sm.gif" alt="" align="top" />&nbsp;
                Configuración del Bot LLM
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" id="enableBot">
                    Habilitar Bot
                </label>
            </div>

            <div class="form-group">
                <label>
                    <input type="checkbox" id="autoScroll">
                    Scroll Automático
                </label>
            </div>
            
            <div class="form-group" id="promptDiv">
                <label for="prompt">Prompt:</label>
                <textarea id="prompt" placeholder="${botPromptPlaceholder}" rows="4"></textarea>
            </div>

            <div class="form-group" id="imageDiv">
                <label for="botImage">Imagen del bot:</label>
                <input type="text" id="botImage" placeholder="${botImageURL}">
            </div>
            
            <div class="form-group" id="signatureDiv">
                <label for="signature">Firma:</label>
                <textarea id="signature" placeholder="${botSignature}" rows="4"></textarea>
            </div>
            
            <div class="button-group">
                <button id="saveBtn" class="pixel-button">Guardar</button>
                <button id="resetBtn" class="pixel-button">Resetear</button>
            </div>
        </div>
        <script>
          const runCode = () => {
            // Definir variables con los valores por defecto (escapados)
            const defaultPrompt = "${botPromptPlaceholder}";
            const defaultImage = "${botImageURL}";
            const defaultSignature = "${botSignature}";
            
            // Cargar configuración existente al iniciar
            function loadConfig() {
                document.getElementById('enableBot').checked = localStorage.getItem('llmBotEnabled') === 'true';
                document.getElementById('autoScroll').checked = localStorage.getItem('llmBotAutoScroll') === 'true';
                document.getElementById('prompt').value = localStorage.getItem('llmBotPrompt') || defaultPrompt;
                document.getElementById('botImage').value = localStorage.getItem('llmBotImage') || defaultImage;
                document.getElementById('signature').value = localStorage.getItem('llmBotSignature') || defaultSignature;
            }
            
            // Guardar configuración
            document.getElementById('saveBtn').addEventListener('click', function() {
                localStorage.setItem('llmBotEnabled', document.getElementById('enableBot').checked);
                localStorage.setItem('llmBotAutoScroll', document.getElementById('autoScroll').checked);
                localStorage.setItem('llmBotPrompt', document.getElementById('prompt').value);
                localStorage.setItem('llmBotImage', document.getElementById('botImage').value);
                localStorage.setItem('llmBotSignature', document.getElementById('signature').value);
                
                window.location = window.location.href.split("#")[0];
            });

            // Reset config
            document.getElementById('resetBtn').addEventListener('click', function() {
                localStorage.removeItem('llmBotEnabled');
                localStorage.removeItem('llmBotAutoScroll');
                localStorage.removeItem('llmBotPrompt');
                localStorage.removeItem('llmBotImage');
                localStorage.removeItem('llmBotSignature');

                loadConfig(); // Recargar valores por defecto
                window.location = window.location.href.split("#")[0];
            });

            // Cargar configuración al iniciar
            loadConfig();
          }

          ${RUN_FROM_GREASYMONKEY ? "" : "runCode();"};
        </script>
${RUN_FROM_GREASYMONKEY ? `<button onclick="(function() {
        // Definir variables con los valores por defecto (escapados)
        const defaultPrompt = '${botPromptPlaceholder}';
        const defaultImage = '${botImageURL}';
        const defaultSignature = '${botSignature}';

        // Cargar configuración existente al iniciar
        function loadConfig() {
            if (document.getElementById('enableBot')) {
                document.getElementById('enableBot').checked = localStorage.getItem('llmBotEnabled') === 'true';
            }
            if (document.getElementById('autoScroll')) {
                document.getElementById('autoScroll').checked = localStorage.getItem('llmBotAutoScroll') === 'true';
            }
            if (document.getElementById('prompt')) {
                document.getElementById('prompt').value = localStorage.getItem('llmBotPrompt') || defaultPrompt;
            }
            if (document.getElementById('botImage')) {
                document.getElementById('botImage').value = localStorage.getItem('llmBotImage') || defaultImage;
            }
            if (document.getElementById('signature')) {
                document.getElementById('signature').value = localStorage.getItem('llmBotSignature') || defaultSignature;
            }
        }

        // Guardar configuración
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                localStorage.setItem('llmBotEnabled', document.getElementById('enableBot').checked);
                localStorage.setItem('llmBotAutoScroll', document.getElementById('autoScroll').checked);
                localStorage.setItem('llmBotPrompt', document.getElementById('prompt').value);
                localStorage.setItem('llmBotImage', document.getElementById('botImage').value);
                localStorage.setItem('llmBotSignature', document.getElementById('signature').value);
                window.location = window.location.href.split('#')[0];
            });
        }

        // Reset config
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                localStorage.removeItem('llmBotEnabled');
                localStorage.removeItem('llmBotAutoScroll');
                localStorage.removeItem('llmBotPrompt');
                localStorage.removeItem('llmBotImage');
                localStorage.removeItem('llmBotSignature');
                loadConfig(); // Recargar valores por defecto
                window.location = window.location.href.split('#')[0];
            });
        }

        // Cargar configuración al iniciar
        loadConfig();
    })();
">Ejecutar Configuración</button>` : ""}

    </body>
    </html>`);
    document.close();

    //throw new Error("LLMConfigPage is ready");
};





  /* MAIN */
  if (RUN_ONLY_ON_LOGGED_IN_USERS && isUserLoggedOut()) {
    return `${BOT_NAME} not running for not logged in users`;
  }
  
  
  if (RUN_ONLY_AT_TEST_SUBFORUM && (!isTestSubforum())) {
    if (RUN_FROM_GREASYMONKEY) {
      localStorage.setItem('llmBotEnabled', true);
    }
    return "Script only running at /test/";
  }

  if (RUN_AT_PROFILES_PAGES == false && isProfilesPage()) {
    return "Script not running at /profiles/* pages";
  }

  if (isUserAtProfilePage() || RUNNING_FORUM_IN_LOCAL_SERVER ) {
    inyectNewOptionAtProfilePage();
  }

  if (isUserAtResponsePage() && RUN_AT_POST_FORUM === false) {
    return "Bot not running at url/post.html";
  }

  // detect when navigating directly to #llmBotConfig
  if (isUserAtConfigLLMPage() || (RUNNING_FORUM_IN_LOCAL_SERVER && window.location.href == "http://localhost:8000/index.html#llmBotConfig")) {
    inyectLLMOptionsPage();
  }

  // detect when navigating to url from profile.html using the link
  window.addEventListener("hashchange", () => {
    if (isUserAtConfigLLMPage() || (RUNNING_FORUM_IN_LOCAL_SERVER && window.location.href == "http://localhost:8000/index.html#llmBotConfig")) {
      inyectLLMOptionsPage();
    }
  });

  // Do not run bot if not enabled
  if (localStorage.getItem("llmBotEnabled") === "false" || localStorage.getItem("llmBotEnabled") == null) {
    return;
  }

  // Config bot with user preferences before run
  if (localStorage.getItem("llmBotAutoScroll") === "true") {
    SCROLL_TO_BOT_MESSAGE = true; 
  } else {
    SCROLL_TO_BOT_MESSAGE = false;
  }

  if (localStorage.getItem("llmBotPrompt")) {
    BOT_CONTEXT = localStorage.getItem("llmBotPrompt") 
    BOT_RULES = "";
  }

  BOT_FORUM_IMAGE_URL = localStorage.getItem("llmBotImage") || BOT_FORUM_IMAGE_URL;
  BOT_FORUM_SIGNATURE = localStorage.getItem("llmBotSignature") || BOT_FORUM_SIGNATURE;

  // Run bot
  const forumData = extractForumData();
  const contextData = buildLLMContext(forumData);
  const placeholderElement = createPlaceholderElement();

  generateResponseStream(contextData, placeholderElement).then((success) => {
    if (success) {
      //console.log('Script ejecutado exitosamente en modo stream');
    } else {
      //console.log('Script completado con advertencias');
    }
  });
}

