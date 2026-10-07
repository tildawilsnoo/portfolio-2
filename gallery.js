(function () {
  var images = Array.prototype.slice.call(document.querySelectorAll('.gallery'));
  var box = document.getElementById('lightbox');
  var big = box.querySelector('.lightbox-img');
  var current = 0;

  function show(i) {
    current = (i + images.length) % images.length;
    big.src = images[current].src;
    big.alt = images[current].alt;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function close() {
    box.hidden = true;
    document.body.style.overflow = '';
    images[current].focus();
  }

  images.forEach(function (img, i) {
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.addEventListener('click', function () { show(i); });
    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(i); }
    });
  });
  box.querySelector('.lightbox-close').addEventListener('click', close);
  box.querySelector('.lightbox-prev').addEventListener('click', function () { show(current - 1); });
  box.querySelector('.lightbox-next').addEventListener('click', function () { show(current + 1); });
  box.addEventListener('click', function (e) { if (e.target === box) close(); });
  document.addEventListener('keydown', function (e) {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
})();
