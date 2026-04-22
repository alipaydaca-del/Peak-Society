let currentT = 'Beginner';
let roadmapLessons = [];
let roadmapProgress = [];

async function fetchRoadmapData() {
    if (!window.sbClient) {
        setTimeout(fetchRoadmapData, 500);
        return;
    }
    try {
        const [resLessons, resProg] = await Promise.all([
            window.sbClient.from('lessons').select('*').order('step_number', { ascending: true }),
            window.sbClient.from('user_progress').select('*')
        ]);
        if (resLessons.error && resLessons.error.code !== '42P01') throw resLessons.error;
        if (resProg.error && resProg.error.code !== '42P01') throw resProg.error;
        roadmapLessons = resLessons.data || [];
        roadmapProgress = resProg.data || [];
        renderRoadmap();
    } catch (e) {
        document.getElementById('roadmapContent').innerHTML = `<div style="color:red; padding: 2rem;">Error: ${e.message || JSON.stringify(e)}</div>`;
        console.error("Error fetching roadmap data", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    document.querySelectorAll('.roadmap-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.roadmap-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentT = btn.dataset.tab;
            renderRoadmap();
        });
    });

    // Close Modal
    const viewLessonModal = document.getElementById('viewLessonModal');

    function closeLessonModal() {
        if (viewLessonModal) {
            viewLessonModal.hidden = true;
            document.getElementById('vlContent').innerHTML = ''; // STOP VIDEO PLAYBACK
        }
    }

    document.getElementById('viewLessonClose')?.addEventListener('click', closeLessonModal);

    viewLessonModal?.addEventListener('click', (e) => {
        if (e.target === viewLessonModal) {
            closeLessonModal();
        }
    });

    // Listen for global DB updates to re-fetch
    window.addEventListener('ps_db_updated', (e) => {
        if (e.detail === 'lessons' || e.detail === 'user_progress') {
            fetchRoadmapData();
        }
    });

    fetchRoadmapData(); // Initial render from network
});

function getUserCompletedIds() {
    const session = Store.get('session'); // auth session is still managed securely via Store
    if (!session) return [];
    const myProg = roadmapProgress.find(p => p.user_id === session.userId);
    return myProg && myProg.completed_lessons ? myProg.completed_lessons : [];
}

function getYoutubeThumbnail(htmlContent) {
    if (!htmlContent) return null;
    const match = htmlContent.match(/(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return match ? `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg` : null;
}

function groupLessonsBySection(lessons) {
    const groups = {};
    lessons.forEach(l => {
        if (!groups[l.section]) groups[l.section] = [];
        groups[l.section].push(l);
    });
    return groups;
}

function renderRoadmap() {
    const container = document.getElementById('roadmapContent');
    // Ensure we filter using the exact 'Published' case defined by the database
    const published = roadmapLessons.filter(l => l.status === 'Published').sort((a, b) => parseFloat(a.step_number) - parseFloat(b.step_number));
    const completedIds = getUserCompletedIds();

    const activeTabObj = document.querySelector('.roadmap-tab.active');
    currentTab = activeTabObj ? activeTabObj.dataset.tab : 'Beginner';

    // Locking Logic
    const beginnerLessons = published.filter(l => l.tab_level === 'Beginner');
    const intermediateLessons = published.filter(l => l.tab_level === 'Intermediate');

    let beginnerCompleted = beginnerLessons.length > 0 && beginnerLessons.every(l => completedIds.includes(l.id));
    let intermediateCompleted = intermediateLessons.length > 0 && intermediateLessons.every(l => completedIds.includes(l.id));

    if (currentTab === 'Intermediate' && !beginnerCompleted) {
        container.innerHTML = `
            <div style="text-align:center; padding: 4rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px;">
                <h2 style="font-family:'Bebas Neue'; font-size: 2.5rem; color:#888;">Locked</h2>
                <p style="color:var(--mid); margin-top:1rem;">You must complete all published Beginner lessons to unlock Intermediate.</p>
            </div>
        `;
        return;
    }
    if (currentT === 'Advanced' && (!beginnerCompleted || !intermediateCompleted)) {
        container.innerHTML = `
            <div style="text-align:center; padding: 4rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px;">
                <h2 style="font-family:'Bebas Neue'; font-size: 2.5rem; color:#888;">Locked</h2>
                <p style="color:var(--mid); margin-top:1rem;">You must complete all published Beginner and Intermediate lessons to unlock Advanced.</p>
            </div>
        `;
        return;
    }

    const currentLessons = published.filter(l => l.tab_level === currentT);

    if (currentLessons.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 3rem; color:var(--mid);">No lessons published for this tier yet.</div>';
        return;
    }

    const groups = groupLessonsBySection(currentLessons);
    let html = '';

    for (const [sectionName, sectionLessons] of Object.entries(groups)) {
        html += `
            <div style="margin-bottom: 3rem;">
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:1.5rem;">
        `;

        sectionLessons.forEach(l => {
            const isCompleted = completedIds.includes(l.id);
            const thumb = getYoutubeThumbnail(l.content);
            html += `
                <div class="forum-post" style="border:${isCompleted ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.05)'}; cursor:pointer; height:100%; display:flex; flex-direction:column; animation: fadeIn 0.4s ease forwards;" onclick="openViewLesson('${sanitize(l.id)}')">
                    ${isCompleted ? '<div style="position:absolute; top:1rem; right:1rem; color:var(--accent); font-size:1.5rem; z-index:10;">✓</div>' : ''}
                    <div style="font-family:'DM Mono'; font-size:0.8rem; color:var(--mid); margin-bottom:0.8rem; text-transform:uppercase; letter-spacing:1px;">Step ${sanitize(l.step_number.toString())}</div>
                    <div class="post-title" style="margin-bottom:1rem; flex-shrink:0;">${sanitize(l.title)}</div>
                    
                    ${thumb ? `
                    <div class="post-image-container" style="flex-grow:1; display:flex; flex-direction:column; justify-content:flex-end;">
                      <div class="post-image-wrapper" style="position:relative; width:100%; padding-top:56.25%;">
                        <img src="${thumb}" alt="Lesson Thumbnail" class="post-image-img" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:8px;" loading="lazy" />
                      </div>
                    </div>` : ''}
                    
                    ${!thumb && l.description ? `
                    <div class="post-excerpt" style="flex-grow:1;">${sanitize(l.description)}</div>
                    ` : ''}
                </div>
            `;
        });

        html += `</div></div>`;
    }

    container.innerHTML = html;
}

function openViewLesson(id) {
    const session = Store.get('session');
    if (!session) {
        alert("Please sign in to view lessons.");
        return;
    }

    const lesson = roadmapLessons.find(l => l.id === id);
    if (!lesson) return;

    document.getElementById('vlStepSection').textContent = `${lesson.step_number} / ${lesson.section}`;
    document.getElementById('vlTitle').textContent = lesson.title;

    document.getElementById('vlContent').innerHTML = lesson.content;

    const completedIds = getUserCompletedIds();
    const isComp = completedIds.includes(id);
    const btn = document.getElementById('vlCompleteBtn');

    if (isComp) {
        btn.textContent = "✓ Completed";
        btn.classList.add('btn-ghost');
        btn.classList.remove('btn-primary');
    } else {
        btn.textContent = "Mark as Completed";
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-ghost');
    }

    btn.onclick = () => toggleLessonComplete(id);

    document.getElementById('viewLessonModal').hidden = false;
}

async function toggleLessonComplete(lessonId) {
    const session = Store.get('session');
    if (!session || !window.sbClient) return;

    let myProg = roadmapProgress.find(p => p.user_id === session.userId);
    let completed = myProg && myProg.completed_lessons ? [...myProg.completed_lessons] : [];

    if (completed.includes(lessonId)) {
        completed = completed.filter(i => i !== lessonId);
    } else {
        completed.push(lessonId);
    }

    const payload = {
        user_id: session.userId,
        completed_lessons: completed
    };

    // Optimistic UI updates
    if (myProg) myProg.completed_lessons = completed;
    else roadmapProgress.push({ ...payload, id: `temp-${Date.now()}` });

    renderRoadmap();
    openViewLesson(lessonId); // Refresh modal UI

    try {
        await window.sbClient.from('user_progress').upsert(payload);
    } catch (e) {
        console.error("Failed to save progress", e);
    }
}
