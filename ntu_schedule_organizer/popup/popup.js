// NTU Learn Schedule Organizer - Popup Dashboard Script with High Precision DDL Radar & UI Alignment

document.addEventListener('DOMContentLoaded', async () => {
  const searchInput = document.getElementById('search-input');
  const courseFilter = document.getElementById('filter-course');
  const typeFilter = document.getElementById('filter-type');
  const scheduleList = document.getElementById('schedule-list');
  const emptyState = document.getElementById('empty-state');
  const totalBadge = document.getElementById('total-badge');
  const syncStatus = document.getElementById('sync-status');
  
  const count24hEl = document.getElementById('count-24h');
  const count3dEl = document.getElementById('count-3d');
  const countWeekEl = document.getElementById('count-week');

  const btnSync = document.getElementById('btn-sync');
  const btnExportIcal = document.getElementById('btn-export-ical');
  const btnLoadDemo = document.getElementById('btn-load-demo');

  let currentItems = [];

  await loadDataFromStorage();

  searchInput.addEventListener('input', renderScheduleList);
  courseFilter.addEventListener('change', renderScheduleList);
  typeFilter.addEventListener('change', renderScheduleList);

  btnSync.addEventListener('click', async () => {
    btnSync.innerHTML = '<span>⏳ 同步中...</span>';
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('ntulearn.ntu.edu.sg')) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TRIGGER_SYNC' }, async (response) => {
          setTimeout(async () => {
            await loadDataFromStorage();
            btnSync.innerHTML = `
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg> 刷新同步`;
          }, 1000);
        });
      } else {
        alert('请在 Edge / Chrome 浏览器中打开 NTU Learn (ntulearn.ntu.edu.sg) 网页后再点击同步！');
        btnSync.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg> 刷新同步`;
      }
    }
  });

  btnExportIcal.addEventListener('click', exportToICalendar);

  btnLoadDemo.addEventListener('click', () => {
    currentItems = getSampleNTUSchedule();
    saveItemsToStorage(currentItems);
    populateCourseFilterOptions(currentItems);
    renderScheduleList();
    syncStatus.innerText = '已加载样例数据';
  });

  async function loadDataFromStorage() {
    const sanitizeTitle = (t) => (t || '').replace(/^Skip to main content$/i, '').trim();
    const sanitizeCourse = (c) => (c || '').replace(/esPE/g, 'PE').replace(/OpenCourse status Open/gi, '').replace(/Skip to main content/gi, '').trim();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['ntu_schedule_items', 'last_updated'], (result) => {
        if (result.ntu_schedule_items && result.ntu_schedule_items.length > 0) {
          currentItems = result.ntu_schedule_items.filter(i => i.title && !i.title.toLowerCase().includes('skip to')).map(i => ({
            ...i,
            title: sanitizeTitle(i.title),
            course_name: sanitizeCourse(i.course_name)
          }));
          const timeAgo = result.last_updated ? formatTimeAgo(new Date(result.last_updated)) : '刚刚';
          syncStatus.innerText = `最近更新: ${timeAgo}`;
        } else {
          const localStr = localStorage.getItem('ntu_schedule_items');
          if (localStr) {
            try {
              currentItems = JSON.parse(localStr).filter(i => i.title && !i.title.toLowerCase().includes('skip to')).map(i => ({
                ...i,
                title: sanitizeTitle(i.title),
                course_name: sanitizeCourse(i.course_name)
              }));
              syncStatus.innerText = '已同步网页 DDL 数据';
            } catch (e) {
              currentItems = getSampleNTUSchedule();
            }
          } else {
            currentItems = getSampleNTUSchedule();
            syncStatus.innerText = '使用样例数据 (在 NTU Learn 自动更新)';
          }
        }
        populateCourseFilterOptions(currentItems);
        renderScheduleList();
      });
    } else {
      currentItems = getSampleNTUSchedule();
      populateCourseFilterOptions(currentItems);
      renderScheduleList();
    }
  }

  function saveItemsToStorage(items) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ 
        ntu_schedule_items: items,
        last_updated: new Date().toISOString()
      });
    }
  }

  function populateCourseFilterOptions(items) {
    const coursesMap = new Map();

    items.forEach(item => {
      if (item.course_name) {
        let cleanName = item.course_name
          .replace(/(Assignments|Content|Calendar|Discussions|Gradebook|Messages|Groups|GenAI|\.pdf).*/gi, '')
          .trim();
        
        const match = cleanName.match(/([A-Z]{2,4}\d{4}(?:\-[A-Za-z0-9\s\&\:]+)?)/i);
        if (match) {
          cleanName = match[1].trim();
        }

        item.course_name = cleanName;
        coursesMap.set(cleanName.toLowerCase(), cleanName);
      }
    });

    courseFilter.innerHTML = '<option value="ALL">全部课程 (All Courses)</option>';
    coursesMap.forEach((displayName) => {
      const opt = document.createElement('option');
      opt.value = displayName;
      opt.textContent = displayName;
      courseFilter.appendChild(opt);
    });
  }

  // Count items for Urgency Radar (Includes recently passed uncompleted DDLs in red urgent count!)
  function updateUrgencyRadar(items) {
    let count24h = 0;
    let count3d = 0;
    let countWeek = 0;
    const now = Date.now();

    items.forEach(item => {
      if (item.completed) return;
      if (!item.due_at) return;

      const dueTime = new Date(item.due_at).getTime();
      const diffMs = dueTime - now;

      // Urgent red: Due within 24h OR uncompleted DDL within last 72 hours!
      if (diffMs <= 24 * 60 * 60 * 1000 && diffMs >= -72 * 60 * 60 * 1000) {
        count24h++;
      } else if (diffMs > 24 * 60 * 60 * 1000 && diffMs <= 3 * 24 * 60 * 60 * 1000) {
        count3d++;
      } else if (diffMs > 3 * 24 * 60 * 60 * 1000) {
        countWeek++;
      }
    });

    count24hEl.innerText = count24h;
    count3dEl.innerText = count3d;
    countWeekEl.innerText = countWeek;
  }

  function renderScheduleList() {
    const query = searchInput.value.toLowerCase().trim();
    const selectedCourse = courseFilter.value;
    const selectedType = typeFilter.value;

    let filtered = currentItems.filter(item => {
      const matchesSearch = !query || 
        item.title.toLowerCase().includes(query) || 
        (item.course_name && item.course_name.toLowerCase().includes(query)) ||
        (item.details && item.details.toLowerCase().includes(query));

      const matchesCourse = selectedCourse === 'ALL' || item.course_name === selectedCourse;
      const matchesType = selectedType === 'ALL' || item.type === selectedType;

      return matchesSearch && matchesCourse && matchesType;
    });

    // Prioritize uncompleted tasks & urgent DDLs at top of the list!
    filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (!a.due_at && !b.due_at) return 0;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });

    updateUrgencyRadar(currentItems);
    totalBadge.innerText = `共 ${filtered.length} 项`;

    scheduleList.innerHTML = '';

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    } else {
      emptyState.classList.add('hidden');
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = `item-card ${item.completed ? 'completed' : ''}`;

      const dueInfo = formatDueDate(item.due_at);
      const fullUrl = item.html_url?.startsWith('http') ? item.html_url : `https://ntulearn.ntu.edu.sg${item.html_url || ''}`;

      const typeMap = {
        'assignment': '📝 课后作业',
        'quiz': '⏱️ 测验考试',
        'discussion_topic': '💬 讨论/公告',
        'planner_note': '📌 日程笔记'
      };

      const summary = item.bilingual_summary || generateBilingualSummary(item);

      card.innerHTML = `
        <input type="checkbox" class="item-checkbox" ${item.completed ? 'checked' : ''} data-id="${item.id}">
        <div class="item-main">
          <div class="item-top">
            <span class="course-tag">${escapeHtml(item.course_name || 'NTU Course')}</span>
            <span class="type-tag ${item.type}">${typeMap[item.type] || '📝 任务'}</span>
            ${item.points_possible ? `<span class="course-tag" style="color: #fbbf24;">${item.points_possible} 分</span>` : ''}
          </div>
          <a href="${fullUrl}" target="_blank" class="item-title">${escapeHtml(item.title)}</a>
          
          <div class="item-details-box">
            <div class="summary-row">
              <span class="summary-lang-badge">中文</span>
              <span class="summary-text-zh">${escapeHtml(summary.zh)}</span>
            </div>
            <div class="summary-row">
              <span class="summary-lang-badge" style="background: rgba(14, 165, 233, 0.2); color: #38bdf8;">EN</span>
              <span class="summary-text-en">${escapeHtml(summary.en)}</span>
            </div>
          </div>

          <div class="item-meta" style="margin-top: 6px;">
            <span class="due-badge ${dueInfo.badgeClass}">${dueInfo.label}</span>
            <span>截止时间: ${dueInfo.fullDate}</span>
          </div>
        </div>
      `;

      const chk = card.querySelector('.item-checkbox');
      chk.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        const targetItem = currentItems.find(i => i.id == id);
        if (targetItem) {
          targetItem.completed = e.target.checked;
          saveItemsToStorage(currentItems);
          renderScheduleList();
        }
      });

      scheduleList.appendChild(card);
    });
  }

  function generateBilingualSummary(item) {
    const title = (item.title || '').toLowerCase();
    const details = (item.details || '').toLowerCase();
    const course = item.course_name || '课程';

    let zhAction = '';
    let enAction = '';

    if (title.includes('problem statement') || title.includes('proposal') || details.includes('problem statement') || title.includes('p1')) {
      zhAction = `📌 [项目提案任务] 请查阅课题要求并定稿提交 Problem Statement (P1)。属于结课项目必交项 (Required Submission)。`;
      enAction = `📌 [Proposal Milestone] Read instructions and submit Problem Statement / P1 proposal draft. Required for project completion.`;
    } 
    else if (title.includes('assignment') || item.type === 'assignment') {
      zhAction = `📌 [作业任务] 需按要求完成并按时提交 ${course} 的课后作业/项目成果。`;
      enAction = `📌 [Assignment Task] Complete and submit course assignment for ${course} before deadline.`;
    }
    else if (title.includes('quiz') || title.includes('exam') || title.includes('test') || item.type === 'quiz') {
      zhAction = `⏱️ [测验与考试] 需在线参加并完成 ${course} 的阶段测验/考试。`;
      enAction = `⏱️ [Quiz / Exam] Online assessment for ${course}. Ensure on-time submission.`;
    }
    else if (title.includes('discussion') || title.includes('forum') || title.includes('helpline')) {
      zhAction = `💬 [讨论论坛/答疑] ${course} 课程讨论与小组答疑板块，可提问及参与小组讨论。`;
      enAction = `💬 [Discussion Forum] Interactive Q&A and group discussion forum for ${course}.`;
    }
    else {
      zhAction = `📢 [课程通知与待办] ${course} 课程重要事项通知，请关注作业要求与提交截止节点。`;
      enAction = `📢 [Course Announcement & Action] Key course update for ${course}. Follow instructions and check deadlines.`;
    }

    return { zh: zhAction, en: enAction };
  }

  // Format Due Date (Highlights recently passed uncompleted DDLs in red urgent badge!)
  function formatDueDate(dueIso) {
    if (!dueIso) {
      return { label: '无明确 DDL', badgeClass: 'no-ddl', fullDate: '随时提交/长期' };
    }

    const dueDate = new Date(dueIso);
    if (isNaN(dueDate.getTime())) {
      return { label: '时间待定', badgeClass: 'no-ddl', fullDate: dueIso };
    }

    const now = new Date();
    const diffMs = dueDate.getTime() - now.getTime();
    const fullDateStr = dueDate.toLocaleString('zh-CN', {
      month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'
    });

    if (diffMs < 0) {
      const passedHours = Math.abs(Math.floor(diffMs / (1000 * 60 * 60)));
      if (passedHours <= 72) {
        return { label: `🚨 紧急补交 (过时 ${passedHours} 小时)`, badgeClass: 'urgent-red', fullDate: fullDateStr };
      }
      return { label: '⚠️ 已截止/过时', badgeClass: 'urgent-red', fullDate: fullDateStr };
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remHours = diffHours % 24;

    if (diffHours < 24) {
      return { label: `🔥 剩余 ${diffHours} 小时`, badgeClass: 'urgent-red', fullDate: fullDateStr };
    } else if (diffDays <= 3) {
      return { label: `⏳ 剩 ${diffDays} 天 ${remHours} 小时`, badgeClass: 'urgent-yellow', fullDate: fullDateStr };
    } else {
      return { label: `📅 剩 ${diffDays} 天`, badgeClass: 'urgent-green', fullDate: fullDateStr };
    }
  }

  function exportToICalendar() {
    if (!currentItems || currentItems.length === 0) {
      alert('当前没有可导出的日程任务！');
      return;
    }

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//NTU Schedule Organizer//CN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:NTU Learn Course DDLs'
    ];

    currentItems.forEach(item => {
      if (!item.due_at) return;
      const due = new Date(item.due_at);
      if (isNaN(due.getTime())) return;

      const dtStamp = formatToICalDate(new Date());
      const dtStart = formatToICalDate(due);

      const endDate = new Date(due.getTime() + 60 * 60 * 1000);
      const dtEnd = formatToICalDate(endDate);

      const summary = `[${item.course_name}] ${item.title}`;
      const description = `NTU Task: ${item.title}\\nType: ${item.type}`;

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:ntu-task-${item.id}@ntulearn.ntu.edu.sg`);
      icsContent.push(`DTSTAMP:${dtStamp}`);
      icsContent.push(`DTSTART:${dtStart}`);
      icsContent.push(`DTEND:${dtEnd}`);
      icsContent.push(`SUMMARY:${escapeICalText(summary)}`);
      icsContent.push(`DESCRIPTION:${escapeICalText(description)}`);
      if (item.html_url) {
        icsContent.push(`URL:${item.html_url.startsWith('http') ? item.html_url : 'https://ntulearn.ntu.edu.sg' + item.html_url}`);
      }
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8;' });
    const link = document.appendLink ? document.createElement('a') : document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `NTU_Schedule_DDL_${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function formatToICalDate(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  function escapeICalText(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function formatTimeAgo(date) {
    const sec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (sec < 60) return '刚刚';
    if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
    return `${Math.floor(sec / 86400)} 天前`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text || '';
    return div.innerHTML;
  }

  function getSampleNTUSchedule() {
    const now = new Date();

    const date1 = new Date(now.getTime() + 14 * 60 * 60 * 1000).toISOString();
    const date2 = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000).toISOString();
    const date3 = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

    return [
      {
        id: 'ntu-201',
        title: 'PE6201 Project Proposal Watchouts & Problem Statement Submission',
        course_name: 'PE6201 Emerging AI Technologies',
        type: 'assignment',
        due_at: date1,
        points_possible: 100,
        details: 'Read PE6201_Project_Proposal_Watchouts.pdf. Finalise submission by Sunday 23 August, 23:59 SGT. Required for End-of-Course Project.',
        html_url: '/courses/pe6201/assignments',
        completed: false
      },
      {
        id: 'ntu-202',
        title: 'PE6203 GenAI Group Assignment',
        course_name: 'PE6203 Generative AI & Agentic AI',
        type: 'assignment',
        due_at: date2,
        points_possible: 100,
        details: 'The group assignment instructions are available under Assignments folder. Deadline 11:59 pm on 13 September.',
        html_url: '/courses/pe6203/assignments',
        completed: false
      },
      {
        id: 'ntu-203',
        title: 'PE6201 Week 3 In Class Discussion & Helpline',
        course_name: 'PE6201 Emerging AI Technologies',
        type: 'discussion_topic',
        due_at: date3,
        details: 'Code walkthrough and coding open hours forum.',
        html_url: '/courses/pe6201/discussions',
        completed: false
      }
    ];
  }
});
