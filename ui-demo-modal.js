(function() {
    var WA_NUM = '917907270363';

    window.openDemoModal = function() {
        try {
            var overlay = document.getElementById('demo-modal-overlay');
            if (!overlay) return;
            overlay.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            var form = document.getElementById('demo-class-form');
            if (form) form.reset();
        } catch(err) { console.error('openDemoModal error:', err); }
    };

    window.closeDemoModal = function() {
        try {
            var overlay = document.getElementById('demo-modal-overlay');
            if (!overlay) return;
            overlay.style.display = 'none';
            document.body.style.overflow = '';
        } catch(err) { console.error('closeDemoModal error:', err); }
    };

    window.closeDemoModalOutside = function(e) {
        var evt = e || window.event;
        var target = evt.target || evt.srcElement;
        if (target && target.id === 'demo-modal-overlay') {
            window.closeDemoModal();
        }
    };

    window.submitDemoForm = function(e) {
        var evt = e || window.event;
        if (evt && evt.preventDefault) evt.preventDefault();
        try {
            var name    = (document.getElementById('demo-name').value || '').trim();
            var email   = (document.getElementById('demo-email').value || '').trim();
            var level   = document.getElementById('demo-level').value || '';
            var age     = (document.getElementById('demo-age').value || '').trim();
            var message = (document.getElementById('demo-message').value || '').trim();

            var msg = '\uD83C\uDFEB *Mind Square \u2014 Demo Class Request*\n\n';
            msg += '\uD83D\uDC64 *Name:* ' + name + '\n';
            msg += '\uD83D\uDCE7 *Email:* ' + email + '\n';
            msg += '\uD83D\uDCCA *Skill Level:* ' + level + '\n';
            msg += '\uD83C\uDF82 *Age:* ' + age + '\n';
            if (message) { msg += '\uD83D\uDCAC *Message:* ' + message + '\n'; }
            msg += '\n_(Sent via Mind Square website)_';

            var waURL = 'https://wa.me/' + WA_NUM + '?text=' + encodeURIComponent(msg);
            window.closeDemoModal();

            // Safari-safe window.open — must be synchronous and user-initiated
            var a = document.createElement('a');
            a.href = waURL;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch(err) { console.error('submitDemoForm error:', err); }
        return false;
    };

    document.addEventListener('keydown', function(e) {
        var evt = e || window.event;
        var key = evt.key || evt.keyCode;
        if (key === 'Escape' || key === 27) {
            var overlay = document.getElementById('demo-modal-overlay');
            if (overlay && overlay.style.display === 'flex') {
                window.closeDemoModal();
            }
        }
    });
})();
