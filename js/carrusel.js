export function initPopupSwiper(containerSelector) {
  if (!window.Swiper) {
    return null;
  }

  const el = document.querySelector(containerSelector);
  if (!el) {
    return null;
  }

  return new window.Swiper(containerSelector, {
    loop: true,
    autoplay: {
      delay: 2800,
      disableOnInteraction: false
    },
    speed: 650,
    slidesPerView: 1,
    spaceBetween: 0,
    navigation: {
      nextEl: `${containerSelector} .swiper-button-next`,
      prevEl: `${containerSelector} .swiper-button-prev`
    },
    pagination: {
      el: `${containerSelector} .swiper-pagination`,
      clickable: true
    }
  });
}
