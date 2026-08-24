// NTU Learn Schedule Organizer - Universal PDF & Assignment Spec Extractor

(function () {
  console.log('[NTU Schedule Organizer] Universal Content Script with Multi-Pattern PDF Extractor.');

  let modalOverlay = null;

  function injectFloatingButton() {
    if (document.getElementById('ntu-schedule-floating-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'ntu-schedule-floating-btn';
    btn.innerHTML = `
      <span class="badge-dot"></span>
      <span>⚡ 智能日程整理</span>
    `;
    btn.title = "点击通用解析全学期课程 PDF、作业指南大纲并整理看板";

    btn.addEventListener('click', async () => {
      btn.innerHTML = `<span>⏳ 正在通用解析课程作业与指南...</span>`;
      const result = await fetchAndSyncNTUSchedule();

      if (result.success) {
        btn.innerHTML = `<span class="badge-dot"></span><span>✅ 已通用整理 ${result.count} 项日程 (点击查看)</span>`;
      } else {
        btn.innerHTML = `<span class="badge-dot"></span><span>⚡ 查看日程看板 (${result.count}项)</span>`;
      }

      openInPageDashboardModal();
    });

    document.body.appendChild(btn);
  }

  function openInPageDashboardModal() {
    if (!modalOverlay) {
      modalOverlay = document.createElement('div');
      modalOverlay.className = 'ntu-schedule-modal-overlay';
      
      const iframeUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) 
        ? chrome.runtime.getURL('popup/popup.html') 
        : '';

      modalOverlay.innerHTML = `
        <div class="ntu-schedule-modal-card">
          <div class="modal-header-bar">
            <span>📅 NTU Learn 全学期课程作业指南大纲与双语看板</span>
            <button class="modal-close-btn" id="ntu-modal-close-btn">✕ 关闭</button>
          </div>
          <iframe src="${iframeUrl}" style="width:100%; height:calc(100% - 40px); border:none; background:#090d16;"></iframe>
        </div>
      `;

      document.body.appendChild(modalOverlay);

      const closeBtn = modalOverlay.querySelector('#ntu-modal-close-btn');
      closeBtn.addEventListener('click', () => {
        modalOverlay.classList.remove('active');
      });

      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          modalOverlay.classList.remove('active');
        }
      });
    }

    modalOverlay.classList.add('active');
  }

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'TRIGGER_SYNC') {
          fetchAndSyncNTUSchedule().then(res => sendResponse(res));
          return true;
        }
      });
    }
  } catch (err) {
    console.warn('[NTU Organizer] runtime listener init skipped:', err);
  }

  function getExistingStoredItems() {
    try {
      const localStr = localStorage.getItem('ntu_schedule_items');
      if (localStr) {
        const parsed = JSON.parse(localStr);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  const JUNK_TITLE_PATTERNS = [
    'skip to main content', 'skip to content', 'skip to course information', 'skip to course',
    'open course status', 'course status open', 'announcements', 'content', 'calendar',
    'discussions', 'gradebook', 'messages', 'groups', 'details & actions', 'course staff',
    'show more', 'view your attendance', 'class register', 'information', 'close', 'nav',
    'posted', '3 total', 'open', '3 started', '9 of 72 started'
  ];

  function isJunkTitle(title) {
    if (!title) return true;
    const clean = title.toLowerCase().trim();
    if (clean.length < 3) return true;
    return JUNK_TITLE_PATTERNS.some(junk => clean === junk || clean.includes('skip to') || clean.includes('course status open'));
  }

  function cleanCourseName(rawName) {
    if (!rawName) return 'NTU Course';
    let name = rawName.replace(/esPE/g, 'PE')
                      .replace(/OpenCourse status Open/gi, '')
                      .replace(/Course status Open/gi, '')
                      .replace(/Skip to main content/gi, '')
                      .trim();

    // Strip trailing breadcrumb noise like "Assignments...", "GenAI...", "Content...", ".pdf..."
    name = name.replace(/(Assignments|Content|Calendar|Discussions|Gradebook|Messages|Groups|GenAI|\.pdf).*/gi, '').trim();

    const courseCodeMatch = name.match(/([A-Z]{2,4}\d{4}(?:\-[A-Za-z0-9\s\&\:]+)?)/i);
    if (courseCodeMatch) {
      name = courseCodeMatch[1].trim();
    }
    return name || 'NTU Course';
  }

  async function fetchAndSyncNTUSchedule() {
    const itemsMap = new Map();

    const existing = getExistingStoredItems();
    existing.forEach(item => {
      if (item && item.id && !isJunkTitle(item.title)) {
        item.course_name = cleanCourseName(item.course_name);
        itemsMap.set(item.id, item);
      }
    });

    const detectedCourseName = cleanCourseName(detectCurrentCourseName());

    // 1. Direct Blackboard REST APIs
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

      // 1a. Global Calendar API
      const bbCalRes = await fetch(`/learn/api/public/v1/calendars/items?start=${startDate}&end=${endDate}&limit=200`, {
        headers: { 'Accept': 'application/json' }
      }).catch(() => null);

      if (bbCalRes && bbCalRes.ok) {
        const bbData = await bbCalRes.json();
        const calItems = bbData.results || bbData || [];
        if (Array.isArray(calItems)) {
          calItems.forEach(item => {
            if (item.title && !isJunkTitle(item.title)) {
              const due = item.end || item.due || item.start;
              const key = `bb-cal-${item.id || item.title}`;
              const cName = cleanCourseName(item.calendarName || item.courseId || detectedCourseName);
              const biSummary = buildBilingualSummary(item.title, item.description || '', cName);
              
              itemsMap.set(key, {
                id: key,
                title: item.title.trim(),
                course_name: cName,
                type: item.type === 'OFFICE_HOURS' ? 'discussion_topic' : 'assignment',
                due_at: due ? new Date(due).toISOString() : null,
                html_url: window.location.href,
                details: item.description || '',
                bilingual_summary: biSummary,
                completed: false
              });
            }
          });
        }
      }

      // 1b. Fetch User Courses, Course Contents & Deep Attachments
      const coursesRes = await fetch(`/learn/api/public/v1/users/me/courses?limit=30`, {
        headers: { 'Accept': 'application/json' }
      }).catch(() => null);

      if (coursesRes && coursesRes.ok) {
        const coursesData = await coursesRes.json();
        const userCourses = coursesData.results || [];
        for (const c of userCourses) {
          const cId = c.courseId;
          const courseTitle = cleanCourseName(c.courseTitle || detectedCourseName);

          if (cId) {
            // 1b-1: Course Announcements API
            const annRes = await fetch(`/learn/api/public/v1/courses/${cId}/announcements`, {
              headers: { 'Accept': 'application/json' }
            }).catch(() => null);

            if (annRes && annRes.ok) {
              const annData = await annRes.json();
              const announcements = annData.results || [];
              announcements.forEach(ann => {
                if (ann.title && !isJunkTitle(ann.title)) {
                  const key = `bb-ann-api-${cId}-${ann.id || ann.title}`;
                  const bodyText = (ann.body || '').replace(/<[^>]+>/g, ' ');
                  const parsedDue = parseDDLFromText(bodyText) || parseDDLFromText(ann.title);
                  const biSummary = buildBilingualSummary(ann.title, bodyText, courseTitle);

                  itemsMap.set(key, {
                    id: key,
                    title: ann.title.trim(),
                    course_name: courseTitle,
                    type: (parsedDue || bodyText.toLowerCase().includes('submission') || bodyText.toLowerCase().includes('due')) ? 'assignment' : 'discussion_topic',
                    due_at: parsedDue ? parsedDue.toISOString() : null,
                    html_url: window.location.href,
                    details: bodyText.slice(0, 350),
                    bilingual_summary: biSummary,
                    completed: false
                  });
                }
              });
            }

            // 1b-2: Course Contents API (Assignments & Files)
            const contentsRes = await fetch(`/learn/api/public/v1/courses/${cId}/contents?limit=100`, {
              headers: { 'Accept': 'application/json' }
            }).catch(() => null);

            if (contentsRes && contentsRes.ok) {
              const contentsData = await contentsRes.json();
              const contentsList = contentsData.results || [];
              contentsList.forEach(cnt => {
                if (cnt.title && !isJunkTitle(cnt.title)) {
                  const key = `bb-cnt-${cId}-${cnt.id || cnt.title}`;
                  const descText = (cnt.description || '').replace(/<[^>]+>/g, ' ');
                  const parsedDue = parseDDLFromText(descText) || parseDDLFromText(cnt.title);
                  const biSummary = buildBilingualSummary(cnt.title, descText, courseTitle);

                  itemsMap.set(key, {
                    id: key,
                    title: cnt.title.trim(),
                    course_name: courseTitle,
                    type: cnt.contentHandler?.id?.includes('assignment') ? 'assignment' : 'assignment',
                    due_at: parsedDue ? parsedDue.toISOString() : null,
                    html_url: window.location.href,
                    details: descText.slice(0, 350),
                    bilingual_summary: biSummary,
                    completed: false
                  });
                }
              });
            }

            // 1b-3: Gradebook columns API
            const gbRes = await fetch(`/learn/api/public/v1/courses/${cId}/gradebook/columns`, {
              headers: { 'Accept': 'application/json' }
            }).catch(() => null);

            if (gbRes && gbRes.ok) {
              const gbData = await gbRes.json();
              const cols = gbData.results || [];
              cols.forEach(col => {
                if (col.name && !isJunkTitle(col.name)) {
                  const key = `bb-gb-${cId}-${col.id || col.name}`;
                  const biSummary = buildBilingualSummary(col.name, col.description || '', courseTitle);
                  itemsMap.set(key, {
                    id: key,
                    title: col.name.trim(),
                    course_name: courseTitle,
                    type: col.grading?.type === 'QUIZ' ? 'quiz' : 'assignment',
                    due_at: col.dueDate ? new Date(col.dueDate).toISOString() : null,
                    html_url: window.location.href,
                    details: col.description || '',
                    points_possible: col.score?.possible || null,
                    bilingual_summary: biSummary,
                    completed: false
                  });
                }
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[NTU Organizer] Blackboard API check skipped:', err);
    }

    // 2. Universal PDF & Document Text Layer Extractor
    const deepPDFItems = scrapeDeepPDFViewerText(detectedCourseName);
    deepPDFItems.forEach(item => {
      itemsMap.set(item.id, item);
    });

    // 3. Deep DOM Scraping
    const scrapedFromDOM = scrapeCurrentPageDOM(detectedCourseName);
    scrapedFromDOM.forEach(item => {
      if (!itemsMap.has(item.id) && !isJunkTitle(item.title)) {
        itemsMap.set(item.id, item);
      }
    });

    const finalItems = Array.from(itemsMap.values()).filter(item => !isJunkTitle(item.title));

    finalItems.sort((a, b) => {
      if (!a.due_at && !b.due_at) return 0;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });

    // Save
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage({
          type: 'SYNC_SCHEDULE_DATA',
          data: finalItems
        }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    } catch (err) {
      console.warn('[NTU Organizer] chrome.runtime.sendMessage context reloaded:', err);
    }

    try {
      localStorage.setItem('ntu_schedule_items', JSON.stringify(finalItems));
      localStorage.setItem('ntu_schedule_last_updated', new Date().toISOString());
    } catch (err) {
      console.warn('[NTU Organizer] localStorage save failed:', err);
    }

    return { success: true, count: finalItems.length };
  }

  function detectCurrentCourseName() {
    const navHeader = document.querySelector('h1, h2, .course-header, [data-analytics-id*="course"], nav, header');
    if (navHeader) {
      const text = navHeader.textContent.trim();
      const match = text.match(/([A-Z]{2,4}\d{4}[A-Z\d\s\-\&\:\_]+)/i);
      if (match) return cleanCourseName(match[1]);
    }

    const docTitle = document.title || '';
    if (docTitle.includes('-')) {
      return cleanCourseName(docTitle.split('-')[0]);
    }

    return 'PE6203 Generative AI & Agentic AI';
  }

  // Universal PDF & Document Text Extractor (Matches Objective, Task, Requirements, Scope, Goal, Deliverables)
  function scrapeDeepPDFViewerText(courseName) {
    const pdfItems = [];
    
    const pdfContainers = document.querySelectorAll(
      '.pdfViewer, .textLayer, iframe[src*="pdf"], iframe[src*="viewer"], .document-viewer, [data-analytics-id*="pdf"], .bb-file-viewer'
    );

    pdfContainers.forEach((viewer, idx) => {
      const fullPdfText = viewer.textContent.trim();
      if (fullPdfText.length > 20) {
        const docHeaderNode = document.querySelector('h1, h2, .breadcrumb, [title*=".pdf"]');
        const pdfTitle = docHeaderNode ? docHeaderNode.textContent.trim() : 'Assignment Document';

        const parsedDue = parseDDLFromText(fullPdfText);
        const biSummary = buildBilingualSummary(pdfTitle, fullPdfText, courseName);

        pdfItems.push({
          id: `pdf-deep-${courseName.slice(0,6)}-${idx}`,
          title: pdfTitle.replace(/\.pdf$/i, ''),
          course_name: courseName,
          type: 'assignment',
          due_at: parsedDue ? parsedDue.toISOString() : null,
          html_url: window.location.href,
          details: fullPdfText.slice(0, 350),
          bilingual_summary: biSummary,
          completed: false
        });
      }
    });

    return pdfItems;
  }

  function scrapeCurrentPageDOM(courseName) {
    const items = [];
    const processedTitles = new Set();

    const modalContainers = document.querySelectorAll(
      '[role="dialog"], .modal, .bb-modal-content, [aria-modal="true"], .panel-content'
    );

    modalContainers.forEach((modal, idx) => {
      const modalHeader = modal.querySelector('h1, h2, h3, .modal-title, header');
      if (modalHeader) {
        const titleText = modalHeader.textContent.trim();
        const fullBodyText = modal.textContent.trim();

        if (titleText.length > 4 && !isJunkTitle(titleText) && !processedTitles.has(titleText)) {
          const parsedDue = parseDDLFromText(fullBodyText);
          const biSummary = buildBilingualSummary(titleText, fullBodyText, courseName);

          processedTitles.add(titleText);
          items.push({
            id: `dom-modal-${courseName.slice(0,6)}-${idx}-${titleText.slice(0, 15).replace(/\s+/g, '')}`,
            title: titleText,
            course_name: courseName,
            type: (titleText.toLowerCase().includes('assignment') || titleText.toLowerCase().includes('problem statement') || fullBodyText.toLowerCase().includes('submission')) ? 'assignment' : 'discussion_topic',
            due_at: parsedDue ? parsedDue.toISOString() : null,
            html_url: window.location.href,
            details: fullBodyText.slice(0, 300),
            bilingual_summary: biSummary,
            completed: false
          });
        }
      }
    });

    const announcementContainers = document.querySelectorAll(
      'tr, li, .announcement-item, .element-card, [data-analytics-id*="announcement"], bb-announcement-card'
    );

    let annIndex = 0;
    announcementContainers.forEach(container => {
      const titleNode = container.querySelector('h3, h4, strong, .element-details, .announcement-title, span[title]');
      if (!titleNode) return;

      const titleText = titleNode.textContent.trim();
      if (!titleText || isJunkTitle(titleText) || processedTitles.has(titleText)) return;

      const fullText = container.textContent.trim();
      const extractedDDL = parseDDLFromText(fullText);
      const biSummary = buildBilingualSummary(titleText, fullText, courseName);

      processedTitles.add(titleText);
      annIndex++;

      items.push({
        id: `dom-ann-${courseName.slice(0,6)}-${annIndex}-${titleText.slice(0, 15).replace(/\s+/g, '')}`,
        title: titleText,
        course_name: courseName,
        type: (extractedDDL || fullText.toLowerCase().includes('submission') || fullText.toLowerCase().includes('problem statement')) ? 'assignment' : 'discussion_topic',
        due_at: extractedDDL ? extractedDDL.toISOString() : null,
        html_url: window.location.href,
        details: fullText.slice(0, 250) + '...',
        bilingual_summary: biSummary,
        completed: false
      });
    });

    return items;
  }

  // Universal Multi-Pattern Summary Builder (Objective, Task, Requirements, Scope, Main Goal, First Key Sentence)
  function buildBilingualSummary(title, text, courseName) {
    const combined = ((title || '') + ' ' + (text || '')).toLowerCase();

    let zh = '';
    let en = '';

    // 1. Universal Pattern Matching across all common academic assignment headers
    const taskSpecMatch = text.match(/(?:main\s*goal|objective|objectives|purpose|task\s*description|overview|requirements|scope)\s*:?\s*([^\n\.\r]{10,160})/i);
    const teamSizeMatch = text.match(/(?:team|group)\s*size\s*:?\s*([^\n\.\r]{3,30})/i);
    const deadlineMatch = text.match(/(?:submission\s*deadline|due\s*date|deadline)\s*:?\s*([^\n\.\r]{5,40})/i);

    if (taskSpecMatch || combined.includes('design your own generative ai application') || combined.includes('genai_group_assignment')) {
      const specStr = taskSpecMatch ? taskSpecMatch[1].trim() : '设计、构建并测试应用项目 (Design & Prototype Project)';
      const teamStr = teamSizeMatch ? teamSizeMatch[1].trim() : '4-6人小组';
      const ddlStr = deadlineMatch ? deadlineMatch[1].trim() : '按课程指定时间点提交';

      zh = `🎯 [主要目标/任务指南] ${specStr}。👥 人数: ${teamStr} | 📅 提交节点: ${ddlStr}`;
      en = `🎯 [Main Task / Spec] ${specStr}. 👥 Team size: ${teamStr} | 📅 Due: ${ddlStr}`;
    }
    else if (combined.includes('problem statement') || combined.includes('proposal') || combined.includes('watchouts') || combined.includes('p1')) {
      zh = `📌 [项目提案/P1任务] 请查阅课题指南并定稿提交 Problem Statement (P1)。属于结课项目必交项 (Required Submission)。`;
      en = `📌 [Proposal & P1 Milestone] Review guide and finalise Problem Statement (P1) submission. Mandatory milestone for End-of-Course project.`;
    }
    else if (combined.includes('group assignment') || combined.includes('team')) {
      zh = `👥 [小组大作业] 小组协作大作业，要求在 Assignments 文件夹完成提交，请关注具体截止节点。`;
      en = `👥 [Group Assignment] Collaborative group project. Complete and submit under Assignments folder.`;
    }
    else if (combined.includes('quiz') || combined.includes('exam') || combined.includes('test')) {
      zh = `⏱️ [测验/考试] ${courseName} 阶段在线测试，请务必在截止日期前开启并完成。`;
      en = `⏱️ [Quiz / Exam] Online test for ${courseName}. Complete before the due time.`;
    }
    else if (combined.includes('discussion') || combined.includes('forum') || combined.includes('helpline')) {
      zh = `💬 [课堂讨论/答疑] ${courseName} 讨论与答疑板块，可在线交流及提交研讨意见。`;
      en = `💬 [Discussion & Q&A] Discussion forum and coding helpline for ${courseName}.`;
    }
    else {
      // Fallback: Extract the first meaningful sentence from the document text
      const cleanSnippet = text.replace(/\s+/g, ' ').trim().slice(0, 140);
      zh = `📢 [课程任务大纲] ${courseName} 指南要求: ${cleanSnippet || '请及时查看详细作业与提交节点。'}`;
      en = `📢 [Course Spec] ${courseName} Spec: ${cleanSnippet || 'Check instructions and submission guidelines.'}`;
    }

    return { zh, en };
  }

  function parseDDLFromText(text) {
    if (!text) return null;

    const currentYear = new Date().getFullYear();

    const p1 = /(?:report\s*submission\s*deadline|finalise|submit|submission|deadline|due|by)\s+.*?(\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:sgt|gmt\+\d)?\s*on\s*)?(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)?\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(?:,\s*(\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:sgt)?))?\s*(\d{4})?/i;
    const match1 = text.match(p1);
    if (match1) {
      const day = match1[2];
      const month = match1[3];
      const timePart = match1[4] || match1[1] || '23:59';
      const year = match1[5] || currentYear;
      
      const cleanTime = timePart.replace(/on|sgt|gmt\+\d/gi, '').trim() || '23:59';
      const dateStr = `${day} ${month} ${year} ${cleanTime}`;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
    }

    const p2 = /(?:deadline|due|by|submission|finalise)\s*:?\s*(?:on\s*)?(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i;
    const match2 = text.match(p2);
    if (match2) {
      const day = match2[1];
      const month = match2[2];
      const d = new Date(`${day} ${month} ${currentYear} 23:59:00`);
      if (!isNaN(d.getTime())) return d;
    }

    const p3 = /(?:deadline|due|ddl)\s*:?\s*(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{4})/i;
    const match3 = text.match(p3);
    if (match3) {
      const d = new Date(match3[1]);
      if (!isNaN(d.getTime())) return d;
    }

    return null;
  }

  window.addEventListener('load', () => {
    injectFloatingButton();
    setTimeout(fetchAndSyncNTUSchedule, 1200);
  });

  let lastUrl = location.href;
  setInterval(() => {
    injectFloatingButton();
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(fetchAndSyncNTUSchedule, 1500);
    }
  }, 2000);

})();
