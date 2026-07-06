        // Modal Handlers
        function openLoginModal() {
            document.getElementById('dev-login-modal').classList.remove('hidden');
            if (window.google && window.google.accounts && window.googleClientId) {
                const container = document.getElementById('google-login-btn-modal');
                if (container) {
                    try {
                        window.google.accounts.id.renderButton(container, {
                            theme: 'dark',
                            size: 'large',
                            shape: 'pill',
                            text: 'signin_with'
                        });
                    } catch (e) {
                        console.warn("Failed to render Google button in modal:", e);
                    }
                }
            }
        }
        function closeLoginModal() {
            document.getElementById('dev-login-modal').classList.add('hidden');
        }

        // Leaderboard Search Filter
        function filterLeaderboard() {
            const query = document.getElementById('leaderboard-search').value.toLowerCase();
            const rows = document.querySelectorAll('#leaderboard-rows tr');
            rows.forEach(row => {
                const name = row.querySelector('td:nth-child(2) span').textContent.toLowerCase();
                if (name.includes(query)) {
                    row.classList.remove('hidden');
                } else {
                    row.classList.add('hidden');
                }
            });
        }



        // GSAP ScrollTrigger & Scroll Reveals
        function initPageAnimations() {
            // Register ScrollTrigger plugin
            if (window.gsap) {
                gsap.config({ nullTargetWarn: false });
                if (window.ScrollTrigger) {
                    gsap.registerPlugin(ScrollTrigger);
                }

                // Initial page load animations
                const heroTl = gsap.timeline({ defaults: { ease: "power4.out" } });
                heroTl.from("section h2", {
                    y: 60,
                    opacity: 0,
                    duration: 1.5,
                    delay: 0.2
                })
                    .from("section p", {
                        y: 30,
                        opacity: 0,
                        duration: 1.2
                    }, "-=1.1")
                    .from("section .flex.flex-col.sm\\:flex-row.gap-4", {
                        y: 20,
                        opacity: 0,
                        duration: 1.0,
                        stagger: 0.2
                    }, "-=0.9")
                    .from("section .relative.w-full.max-w-4xl", {
                        y: 40,
                        opacity: 0,
                        scale: 0.95,
                        duration: 1.5
                    }, "-=1.0");

                // Academy Infrastructure heading scroll reveal
                gsap.from(".bg-surface-container-lowest .mb-20", {
                    scrollTrigger: {
                        trigger: ".bg-surface-container-lowest",
                        start: "top 80%",
                        toggleActions: "play none none none"
                    },
                    y: 40,
                    opacity: 0,
                    duration: 1.0,
                    ease: "power3.out"
                });

                // Feature cards scroll reveal
                gsap.from(".bg-surface-container-lowest .md\\:col-span-7, .bg-surface-container-lowest .md\\:col-span-5", {
                    scrollTrigger: {
                        trigger: ".bg-surface-container-lowest .grid",
                        start: "top 75%",
                        toggleActions: "play none none none"
                    },
                    y: 50,
                    opacity: 0,
                    duration: 1.2,
                    stagger: 0.3,
                    ease: "power4.out"
                });

                gsap.from(".bg-surface-container-lowest .md\\:col-span-12", {
                    scrollTrigger: {
                        trigger: ".bg-surface-container-lowest .md\\:col-span-12",
                        start: "top 80%",
                        toggleActions: "play none none none"
                    },
                    y: 50,
                    opacity: 0,
                    duration: 1.2,
                    ease: "power4.out"
                });

                // CTA section scroll reveal
                gsap.from("#landing-page section.py-32.bg-background .container-max > *", {
                    scrollTrigger: {
                        trigger: "#landing-page section.py-32.bg-background",
                        start: "top 80%",
                        toggleActions: "play none none none"
                    },
                    y: 40,
                    opacity: 0,
                    duration: 1.2,
                    stagger: 0.2,
                    ease: "power3.out"
                });
            }

            // Spotlight Tracker
            initSpotlightTracking();

            // 3D Tilting on hover
            initTiltHover();

            // Shrinking navbar on scroll
            initNavbarScroll();
        }

        function initApp() {
            initPageAnimations();
            initDynamicEventHandlers();
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initApp);
        } else {
            initApp();
        }

        function initDynamicEventHandlers() {
            // Centralized image load error handling to avoid inline onerror CSP violations
            window.addEventListener('error', (event) => {
                if (event.target && event.target.tagName === 'IMG') {
                    const img = event.target;
                    if (!img.dataset.errorHandled) {
                        img.dataset.errorHandled = 'true';
                        let seed = img.getAttribute('data-seed') || 'default';
                        if (seed === 'default') {
                            if (img.id === 'navbar-avatar') {
                                const txtEl = document.getElementById('navbar-user-name-txt');
                                if (txtEl) seed = txtEl.innerText;
                            } else if (img.id === 'dash-user-avatar') {
                                const txtEl = document.getElementById('dash-user-name');
                                if (txtEl) seed = txtEl.innerText;
                            }
                        }
                        img.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(seed || 'default');
                    }
                }
            }, true);

            // Centralized tooltip mouseover/mouseout listeners to avoid inline event handlers
            document.addEventListener('mouseover', (event) => {
                const target = event.target;
                if (target && target.hasAttribute('data-tooltip')) {
                    if (target.tagName === 'circle') {
                        if (typeof window.showGlobalTooltip === 'function') {
                            window.showGlobalTooltip(event, target.getAttribute('data-tooltip'));
                        } else if (typeof showGlobalTooltip === 'function') {
                            showGlobalTooltip(event, target.getAttribute('data-tooltip'));
                        }
                    } else if (target.tagName === 'rect') {
                        if (typeof window.showHeatmapTooltip === 'function') {
                            window.showHeatmapTooltip(event);
                        } else if (typeof showHeatmapTooltip === 'function') {
                            showHeatmapTooltip(event);
                        }
                    }
                }
            });

            document.addEventListener('mouseout', (event) => {
                const target = event.target;
                if (target && target.hasAttribute('data-tooltip')) {
                    if (target.tagName === 'circle') {
                        if (typeof window.hideGlobalTooltip === 'function') {
                            window.hideGlobalTooltip();
                        } else if (typeof hideGlobalTooltip === 'function') {
                            hideGlobalTooltip();
                        }
                    } else if (target.tagName === 'rect') {
                        if (typeof window.hideHeatmapTooltip === 'function') {
                            window.hideHeatmapTooltip();
                        } else if (typeof hideHeatmapTooltip === 'function') {
                            hideHeatmapTooltip();
                        }
                    }
                }
            });

            // Bind individual dynamic handlers securely
            const demoForm = document.getElementById('demo-class-form');
            if (demoForm) {
                demoForm.addEventListener('submit', (e) => {
                    if (typeof window.submitDemoForm === 'function') window.submitDemoForm(e);
                    else if (typeof submitDemoForm === 'function') submitDemoForm(e);
                });
            }

            const avatarInput = document.getElementById('avatar-file-input');
            if (avatarInput) {
                avatarInput.addEventListener('change', (e) => {
                    if (typeof window.uploadUserAvatar === 'function') window.uploadUserAvatar(e);
                    else if (typeof uploadUserAvatar === 'function') uploadUserAvatar(e);
                });
            }

            const chatInput = document.getElementById('live-chat-input');
            if (chatInput) {
                chatInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        if (typeof window.sendLiveChatMessage === 'function') window.sendLiveChatMessage();
                        else if (typeof sendLiveChatMessage === 'function') sendLiveChatMessage();
                    }
                });
            }

            const arenaSelect = document.getElementById('arena-mode-select');
            if (arenaSelect) {
                arenaSelect.addEventListener('change', (e) => {
                    if (typeof window.changeArenaMode === 'function') window.changeArenaMode(e.target.value);
                    else if (typeof changeArenaMode === 'function') changeArenaMode(e.target.value);
                });
            }

            const studentSearch = document.getElementById('classes-student-search');
            if (studentSearch) {
                studentSearch.addEventListener('input', (e) => {
                    if (typeof window.highlightStudentName === 'function') window.highlightStudentName(e.target.value);
                    else if (typeof highlightStudentName === 'function') highlightStudentName(e.target.value);
                });
            }

            const leaderboardSearch = document.getElementById('leaderboard-search');
            if (leaderboardSearch) {
                leaderboardSearch.addEventListener('input', (e) => {
                    if (typeof window.filterLeaderboard === 'function') window.filterLeaderboard();
                    else if (typeof filterLeaderboard === 'function') filterLeaderboard();
                });
            }

            const endgameSelect = document.getElementById('endgame-scenario-select');
            if (endgameSelect) {
                endgameSelect.addEventListener('change', (e) => {
                    if (typeof window.loadEndgameScenario === 'function') window.loadEndgameScenario(e.target.value);
                    else if (typeof loadEndgameScenario === 'function') loadEndgameScenario(e.target.value);
                });
            }
        }

        function initSpotlightTracking() {
            document.querySelectorAll('.glass-card').forEach(card => {
                card.addEventListener('mousemove', e => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    card.style.setProperty('--mouse-x', `${x}px`);
                    card.style.setProperty('--mouse-y', `${y}px`);
                });
            });
        }

        function initTiltHover() {
            // Hero section custom interaction
            const heroSec = document.querySelector('section');
            if (heroSec) {
                heroSec.addEventListener('mousemove', (e) => {
                    const x = (e.clientX / window.innerWidth - 0.5) * 8;
                    const y = (e.clientY / window.innerHeight - 0.5) * 8;
                    const visualization = document.querySelector('.glow-accent');
                    if (visualization) {
                        visualization.style.transform = `perspective(1000px) rotateY(${x}deg) rotateX(${-y}deg)`;
                    }
                });

                heroSec.addEventListener('mouseleave', () => {
                    const visualization = document.querySelector('.glow-accent');
                    if (visualization) {
                        visualization.style.transform = `perspective(1000px) rotateY(0deg) rotateX(0deg)`;
                    }
                });
            }

            // Feature cards and leaderboard card hover tilt
            if (window.gsap) {
                const tiltCards = document.querySelectorAll('.bg-surface-container, .bg-surface-container-lowest .glass-card, #landing-page .glass-card');
                tiltCards.forEach(card => {
                    // Do not tilt the main hero container
                    if (card.classList.contains('glow-accent') && card.tagName === 'DIV' && card.parentElement.tagName === 'SECTION') return;

                    card.addEventListener('mousemove', e => {
                        const rect = card.getBoundingClientRect();
                        const x = e.clientX - rect.left - rect.width / 2;
                        const y = e.clientY - rect.top - rect.height / 2;
                        const rotateX = -(y / rect.height) * 8;
                        const rotateY = (x / rect.width) * 8;

                        gsap.to(card, {
                            rotateX: rotateX,
                            rotateY: rotateY,
                            transformPerspective: 800,
                            ease: "power2.out",
                            duration: 0.3
                        });
                    });

                    card.addEventListener('mouseleave', () => {
                        gsap.to(card, {
                            rotateX: 0,
                            rotateY: 0,
                            ease: "power2.out",
                            duration: 0.5
                        });
                    });
                });
            }
        }

        function initNavbarScroll() {
            const header = document.querySelector('header');
            if (header) {
                window.addEventListener('scroll', () => {
                    if (window.scrollY > 20) {
                        header.classList.add('h-14', 'bg-surface/95', 'shadow-lg');
                        header.classList.remove('h-16', 'bg-surface/70');
                    } else {
                        header.classList.remove('h-14', 'bg-surface/95', 'shadow-lg');
                        header.classList.add('h-16', 'bg-surface/70');
                    }
                });
            }
        }

// ============================================================================
// CENTRALIZED EVENT DELEGATION SYSTEM (CSP Hardening / OWASP XSS Mitigation)
// ============================================================================
document.addEventListener('click', (event) => {
    let target = event.target;
    while (target && target !== document.body && target !== document.documentElement) {
        if (target.hasAttribute('data-nav')) {
            const page = target.getAttribute('data-nav');
            if (typeof window.navigateTo === 'function') window.navigateTo(page);
            else if (typeof navigateTo === 'function') navigateTo(page);
            return;
        }

        if (target.hasAttribute('data-action')) {
            const action = target.getAttribute('data-action');
            const arg = target.getAttribute('data-arg');
            executeGlobalAction(action, arg, target, event);
            return;
        }

        target = target.parentElement;
    }
});

function executeGlobalAction(action, arg, target, event) {
    switch (action) {
        case 'applyModalImportExport':
            if (typeof window.applyModalImportExport === 'function') window.applyModalImportExport();
            else if (typeof applyModalImportExport === 'function') applyModalImportExport();
            break;
        case 'cancelCustomRepertoireMode':
            if (typeof window.cancelCustomRepertoireMode === 'function') window.cancelCustomRepertoireMode();
            else if (typeof cancelCustomRepertoireMode === 'function') cancelCustomRepertoireMode();
            break;
        case 'changeBoardSkin':
            if (typeof window.changeBoardSkin === 'function') window.changeBoardSkin(arg);
            else if (typeof changeBoardSkin === 'function') changeBoardSkin(arg);
            break;
        case 'changeCameraAngle':
            if (typeof window.changeCameraAngle === 'function') window.changeCameraAngle(arg);
            else if (typeof changeCameraAngle === 'function') changeCameraAngle(arg);
            break;
        case 'changeDifficulty':
            if (typeof window.changeDifficulty === 'function') window.changeDifficulty(arg);
            else if (typeof changeDifficulty === 'function') changeDifficulty(arg);
            break;
        case 'closeAnnouncementModal':
            if (typeof window.closeAnnouncementModal === 'function') window.closeAnnouncementModal();
            else if (typeof closeAnnouncementModal === 'function') closeAnnouncementModal();
            break;
        case 'closeBirthdayModal':
            if (typeof window.closeBirthdayModal === 'function') window.closeBirthdayModal();
            else if (typeof closeBirthdayModal === 'function') closeBirthdayModal();
            break;
        case 'closeDemoModal':
            if (typeof window.closeDemoModal === 'function') window.closeDemoModal();
            else if (typeof closeDemoModal === 'function') closeDemoModal();
            break;
        case 'closeImportExportModal':
            if (typeof window.closeImportExportModal === 'function') window.closeImportExportModal();
            else if (typeof closeImportExportModal === 'function') closeImportExportModal();
            break;
        case 'closeLoginModal':
            if (typeof window.closeLoginModal === 'function') window.closeLoginModal();
            else if (typeof closeLoginModal === 'function') closeLoginModal();
            break;
        case 'closeSpectatorModal':
            if (typeof window.closeSpectatorModal === 'function') window.closeSpectatorModal();
            else if (typeof closeSpectatorModal === 'function') closeSpectatorModal();
            break;
        case 'closeTournamentModal':
            if (typeof window.closeTournamentModal === 'function') window.closeTournamentModal();
            else if (typeof closeTournamentModal === 'function') closeTournamentModal();
            break;
        case 'copyModalContent':
            if (typeof window.copyModalContent === 'function') window.copyModalContent();
            else if (typeof copyModalContent === 'function') copyModalContent();
            break;
        case 'triggerAvatarFileInput':
            const fileInput = document.getElementById('avatar-file-input');
            if (fileInput) fileInput.click();
            break;
        case 'downloadProgressReport':
            if (typeof window.downloadProgressReport === 'function') window.downloadProgressReport();
            else if (typeof downloadProgressReport === 'function') downloadProgressReport();
            break;
        case 'editDisplayName':
            if (typeof window.editDisplayName === 'function') window.editDisplayName();
            else if (typeof editDisplayName === 'function') editDisplayName();
            break;
        case 'stopPropagation':
            event.stopPropagation();
            break;
        case 'exportCurrentPosition':
            if (typeof window.exportCurrentPosition === 'function') window.exportCurrentPosition();
            else if (typeof exportCurrentPosition === 'function') exportCurrentPosition();
            break;
        case 'flipBoardView':
            if (typeof window.flipBoardView === 'function') window.flipBoardView();
            else if (typeof flipBoardView === 'function') flipBoardView();
            break;
        case 'flipSpectatorBoard':
            if (typeof window.flipSpectatorBoard === 'function') window.flipSpectatorBoard();
            else if (typeof flipSpectatorBoard === 'function') flipSpectatorBoard();
            break;
        case 'initLiveChallenge':
            if (typeof window.initLiveChallenge === 'function') window.initLiveChallenge();
            else if (typeof initLiveChallenge === 'function') initLiveChallenge();
            break;
        case 'logoutUser':
            if (typeof window.logoutUser === 'function') window.logoutUser();
            else if (typeof logoutUser === 'function') logoutUser();
            break;
        case 'navigateReview':
            if (typeof window.navigateReview === 'function') window.navigateReview(arg);
            else if (typeof navigateReview === 'function') navigateReview(arg);
            break;
        case 'openAnnouncementModal':
            if (typeof window.openAnnouncementModal === 'function') window.openAnnouncementModal();
            else if (typeof openAnnouncementModal === 'function') openAnnouncementModal();
            break;
        case 'openDemoModal':
            if (typeof window.openDemoModal === 'function') window.openDemoModal();
            else if (typeof openDemoModal === 'function') openDemoModal();
            break;
        case 'openImportModal':
            if (typeof window.openImportModal === 'function') window.openImportModal();
            else if (typeof openImportModal === 'function') openImportModal();
            break;
        case 'openLoginModal':
            if (typeof window.openLoginModal === 'function') window.openLoginModal();
            else if (typeof openLoginModal === 'function') openLoginModal();
            break;
        case 'openTournamentModal':
            if (typeof window.openTournamentModal === 'function') window.openTournamentModal();
            else if (typeof openTournamentModal === 'function') openTournamentModal();
            break;
        case 'resetChessMatch':
            if (typeof window.resetChessMatch === 'function') window.resetChessMatch();
            else if (typeof resetChessMatch === 'function') resetChessMatch();
            break;
        case 'resetEndgameTrainer':
            if (typeof window.resetEndgameTrainer === 'function') window.resetEndgameTrainer();
            else if (typeof resetEndgameTrainer === 'function') resetEndgameTrainer();
            break;
        case 'resetOpeningExplorer':
            if (typeof window.resetOpeningExplorer === 'function') window.resetOpeningExplorer();
            else if (typeof resetOpeningExplorer === 'function') resetOpeningExplorer();
            break;
        case 'resetPuzzleMatch':
            if (typeof window.resetPuzzleMatch === 'function') window.resetPuzzleMatch();
            else if (typeof resetPuzzleMatch === 'function') resetPuzzleMatch();
            break;
        case 'saveCustomRepertoire':
            if (typeof window.saveCustomRepertoire === 'function') window.saveCustomRepertoire();
            else if (typeof saveCustomRepertoire === 'function') saveCustomRepertoire();
            break;
        case 'selectClockPreset':
            const presetVal = parseInt(arg, 10);
            if (typeof window.selectClockPreset === 'function') {
                window.selectClockPreset(presetVal);
            } else if (typeof selectClockPreset === 'function') {
                selectClockPreset(presetVal);
            }
            break;
        case 'setLiveClockLimit':
            window._liveClockLimit = parseInt(arg, 10);
            break;
        case 'selectModalFormat':
            if (typeof window.selectModalFormat === 'function') window.selectModalFormat(arg);
            else if (typeof selectModalFormat === 'function') selectModalFormat(arg);
            break;
        case 'sendLiveChatMessage':
            if (typeof window.sendLiveChatMessage === 'function') window.sendLiveChatMessage();
            else if (typeof sendLiveChatMessage === 'function') sendLiveChatMessage();
            break;
        case 'startCustomRepertoireMode':
            if (typeof window.startCustomRepertoireMode === 'function') window.startCustomRepertoireMode();
            else if (typeof startCustomRepertoireMode === 'function') startCustomRepertoireMode();
            break;
        case 'startDailyPuzzle':
            if (typeof window.startDailyPuzzle === 'function') window.startDailyPuzzle();
            else if (typeof startDailyPuzzle === 'function') startDailyPuzzle();
            break;
        case 'startVisionSession':
            if (typeof window.startVisionSession === 'function') window.startVisionSession();
            else if (typeof startVisionSession === 'function') startVisionSession();
            break;
        case 'stopVisionSession':
            if (typeof window.stopVisionSession === 'function') window.stopVisionSession();
            else if (typeof stopVisionSession === 'function') stopVisionSession();
            break;
        case 'submitAnnouncement':
            if (typeof window.submitAnnouncement === 'function') window.submitAnnouncement();
            else if (typeof submitAnnouncement === 'function') submitAnnouncement();
            break;
        case 'submitDob':
            if (typeof window.submitDob === 'function') window.submitDob();
            else if (typeof submitDob === 'function') submitDob();
            break;
        case 'submitTournament':
            if (typeof window.submitTournament === 'function') window.submitTournament();
            else if (typeof submitTournament === 'function') submitTournament();
            break;
        case 'toggleArenaSound':
            if (typeof window.toggleArenaSound === 'function') window.toggleArenaSound();
            else if (typeof toggleArenaSound === 'function') toggleArenaSound();
            break;
        case 'toggleEngineView':
            if (typeof window.toggleEngineView === 'function') window.toggleEngineView(arg);
            else if (typeof toggleEngineView === 'function') toggleEngineView(arg);
            break;
        case 'toggleOpeningMemoryTraining':
            if (typeof window.toggleOpeningMemoryTraining === 'function') window.toggleOpeningMemoryTraining();
            else if (typeof toggleOpeningMemoryTraining === 'function') toggleOpeningMemoryTraining();
            break;
        case 'togglePuzzleHint':
            if (typeof window.togglePuzzleHint === 'function') window.togglePuzzleHint();
            else if (typeof togglePuzzleHint === 'function') togglePuzzleHint();
            break;
        case 'toggleSidebar':
            if (typeof window.toggleSidebar === 'function') window.toggleSidebar();
            else if (typeof toggleSidebar === 'function') toggleSidebar();
            break;
        case 'toggleTheme':
            if (typeof window.toggleTheme === 'function') window.toggleTheme();
            else if (typeof toggleTheme === 'function') toggleTheme();
            break;
        case 'viewStudentProfile':
            const finalVal = arg === 'null' ? null : arg;
            if (typeof window.viewStudentProfile === 'function') window.viewStudentProfile(finalVal);
            else if (typeof viewStudentProfile === 'function') viewStudentProfile(finalVal);
            break;
        case 'showDataDeletionModal':
            if (window.showDataDeletionModal) window.showDataDeletionModal();
            break;
        case 'showPrivacyModal':
            if (window.showPrivacyModal) window.showPrivacyModal();
            break;
        case 'closeDemoModalOutside':
            if (typeof window.closeDemoModalOutside === 'function') window.closeDemoModalOutside(event);
            else if (typeof closeDemoModalOutside === 'function') closeDemoModalOutside(event);
            break;

        // Dynamic API triggers
        case 'openSpectatorModal':
            if (typeof window.openSpectatorModal === 'function') {
                const gameId = target.getAttribute('data-game-id');
                const whiteName = target.getAttribute('data-white-name');
                const blackName = target.getAttribute('data-black-name');
                const fen = target.getAttribute('data-fen');
                window.openSpectatorModal(gameId, whiteName, blackName, fen);
            }
            break;
        case 'registerTournament':
            if (typeof window.registerTournament === 'function') {
                window.registerTournament(parseInt(target.getAttribute('data-id'), 10));
            }
            break;
        case 'updateTournamentStatus':
            if (typeof window.updateTournamentStatus === 'function') {
                window.updateTournamentStatus(
                    parseInt(target.getAttribute('data-id'), 10),
                    target.getAttribute('data-status')
                );
            }
            break;
        case 'deleteTournament':
            if (typeof window.deleteTournament === 'function') {
                window.deleteTournament(parseInt(target.getAttribute('data-id'), 10));
            }
            break;
        case 'toggleTournamentDetails':
            if (typeof window.toggleTournamentDetails === 'function') {
                window.toggleTournamentDetails(
                    parseInt(target.getAttribute('data-id'), 10),
                    target
                );
            }
            break;
        case 'sendChallengeInvite':
            if (typeof window.sendChallengeInvite === 'function') {
                window.sendChallengeInvite(
                    target.getAttribute('data-target-user-id'),
                    target.getAttribute('data-target-user-name'),
                    window._liveClockLimit
                );
            }
            break;
        case 'filterClassesByDay':
            if (typeof window.filterClassesByDay === 'function') window.filterClassesByDay(arg);
            else if (typeof filterClassesByDay === 'function') filterClassesByDay(arg);
            break;
        case 'toggleRecordings':
            if (typeof window.toggleRecordings === 'function') {
                window.toggleRecordings(target.getAttribute('data-id'), target);
            }
            break;
        case 'saveClassRecording':
            if (typeof window.saveClassRecording === 'function') {
                window.saveClassRecording(target.getAttribute('data-id'));
            }
            break;
        case 'removeParentCard':
            if (target.parentElement && target.parentElement.parentElement) {
                target.parentElement.parentElement.remove();
            }
            break;
        case 'acceptCookieConsent':
            if (typeof window.acceptCookieConsent === 'function') window.acceptCookieConsent();
            break;
        case 'hidePrivacyModal':
            if (typeof window.hidePrivacyModal === 'function') window.hidePrivacyModal();
            break;
        case 'hideDataDeletionModal':
            if (typeof window.hideDataDeletionModal === 'function') window.hideDataDeletionModal();
            break;
        case 'requestDataDeletion':
            if (typeof window.requestDataDeletion === 'function') {
                window.requestDataDeletion(target.getAttribute('data-id'));
            }
            break;
        case 'startHomeworkPuzzle':
            if (typeof window.startHomeworkPuzzle === 'function') {
                window.startHomeworkPuzzle(
                    target.getAttribute('data-hw-id'),
                    target.getAttribute('data-puzzle-id'),
                    target.getAttribute('data-user-id')
                );
            }
            break;
        case 'deleteAnnouncement':
            if (typeof window.deleteAnnouncement === 'function') {
                window.deleteAnnouncement(parseInt(target.getAttribute('data-id'), 10));
            }
            break;
        case 'acceptChallenge':
            if (typeof window.acceptChallenge === 'function') {
                window.acceptChallenge(
                    target.getAttribute('data-sender-id'),
                    parseInt(target.getAttribute('data-clock-limit'), 10)
                );
            }
            break;
        case 'declineChallenge':
            if (typeof window.declineChallenge === 'function') {
                window.declineChallenge(target.getAttribute('data-sender-id'));
            }
            break;
        case 'deleteRecording':
            if (typeof window.deleteRecording === 'function') {
                window.deleteRecording(
                    target.getAttribute('data-schedule-id'),
                    parseInt(target.getAttribute('data-recording-id'), 10)
                );
            }
            break;
    }
}