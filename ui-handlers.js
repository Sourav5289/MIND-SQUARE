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
        document.addEventListener('DOMContentLoaded', () => {
            // Register ScrollTrigger plugin
            if (window.gsap && window.ScrollTrigger) {
                gsap.registerPlugin(ScrollTrigger);

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
        });

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