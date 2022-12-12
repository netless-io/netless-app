import { class_name } from "../constants";
import { arrowLeftSVG, arrowRightSVG, pauseSVG, playSVG, sidebarSVG } from "../icons";
import { hc, noop, wrap_class } from "../utils";
import { saveSVG } from "../icons/save";
import { spinnerSVG } from "../icons/spinner";

export function create_footer() {
  type NewPageIndexCallback = (newPageIndex: number) => void;
  let new_page_index_callback: NewPageIndexCallback = noop;
  const on_new_page_index = (callback: NewPageIndexCallback) => {
    new_page_index_callback = callback;
  };

  let toggle_preview_callback: () => void = noop;
  const on_toggle_preview = (callback: () => void) => {
    toggle_preview_callback = callback;
  };

  let play_callback: () => void = noop;
  const on_play = (callback: () => void) => {
    play_callback = callback;
  };

  let readonly = false;
  let sidebar = false;
  let page_index = 0;
  let page_count = 0;

  const $footer = hc("div", "footer");

  const $btnSidebar = hc("button", "btn-sidebar");
  $btnSidebar.classList.add(wrap_class("footer-btn"));
  $btnSidebar.appendChild(sidebarSVG(class_name));
  $btnSidebar.onclick = function on_click_btn_sidebar() {
    if (readonly) return;
    toggle_preview_callback();
  };
  $btnSidebar.style.display = "none";
  $footer.appendChild($btnSidebar);

  const $pageJumps = hc("div", "page-jumps");

  const $btnPageBack = hc("button", "btn-page-back");
  $btnPageBack.classList.add(wrap_class("footer-btn"));
  $btnPageBack.appendChild(arrowLeftSVG(class_name));
  $btnPageBack.onclick = function on_click_btn_page_back() {
    if (readonly) return;
    new_page_index_callback(page_index - 1);
  };
  $pageJumps.appendChild($btnPageBack);

  const $btnPlay = hc("button", "btn-page-play");
  $btnPlay.classList.add(wrap_class("footer-btn"));
  $btnPlay.appendChild(playSVG(class_name));
  $btnPlay.appendChild(pauseSVG(class_name));
  let returnPlayTimer = 0;
  $btnPlay.onclick = function on_click_btn_play() {
    if (readonly) return;
    $btnPlay.classList.add(wrap_class("footer-btn-playing"));
    play_callback();
    clearTimeout(returnPlayTimer);
    returnPlayTimer = window.setTimeout(() => {
      $btnPlay.classList.remove(wrap_class("footer-btn-playing"));
    }, 500);
  };
  $pageJumps.appendChild($btnPlay);

  const $btnPageNext = hc("button", "btn-page-next");
  $btnPageNext.classList.add(wrap_class("footer-btn"));
  $btnPageNext.appendChild(arrowRightSVG(class_name));
  $btnPageNext.onclick = function on_click_btn_page_next() {
    if (readonly) return;
    new_page_index_callback(page_index + 1);
  };
  $pageJumps.appendChild($btnPageNext);

  const $pageNumber = hc("div", "page-number");

  const $pageNumberInput = hc("input", "page-number-input");
  $pageNumberInput.value = String(page_index + 1);
  $pageNumberInput.onchange = function on_change_page_number_input() {
    if (readonly) return;
    if ($pageNumberInput.value) {
      new_page_index_callback(Number($pageNumberInput.value) - 1);
    }
  };

  const $totalPage = hc("span", "total-page");
  $totalPage.textContent = " / ";

  $pageNumber.appendChild($pageNumberInput);
  $pageNumber.appendChild($totalPage);

  $footer.appendChild($pageJumps);
  $footer.appendChild($pageNumber);

  const class_readonly = wrap_class("readonly");

  let saveToPdf: (progressCallback: (p: number) => void) => void = noop;
  const on_save_to_pdf = (callback: (progressCallback: (p: number) => void) => void) => {
    saveToPdf = callback;
  };
  const progressCallback = (p: number) => {
    if (p < 99) {
      spinnerIcon.style.display = "block";
      saveIcon.style.display = "none";
      const progress = spinnerIcon.querySelector("[data-id]");
      if (progress) {
        progress.textContent = p.toString().padStart(2, "0");
      }
    } else {
      spinnerIcon.style.display = "none";
      saveIcon.style.display = "block";
    }
  };
  const saveIcon = saveSVG(class_name);
  const spinnerIcon = spinnerSVG(class_name);
  spinnerIcon.style.display = "none";
  const $saveBtn = hc("button", "footer-btn");
  $saveBtn.appendChild(saveIcon);
  $saveBtn.onclick = function () {
    saveToPdf(progressCallback);
  };
  $saveBtn.appendChild(spinnerIcon);

  // $footer.appendChild($saveBtn);

  function set_readonly(readonly_: boolean) {
    if (readonly !== readonly_) {
      readonly = readonly_;
      $footer.classList.toggle(class_readonly, readonly);
      $pageNumberInput.disabled = readonly;
    }
  }

  function set_sidebar(sidebar_: boolean) {
    if (sidebar !== sidebar_) {
      sidebar = sidebar_;
      $btnSidebar.style.display = sidebar ? "" : "none";
    }
  }

  function set_page_index(page_index_: number, force = false) {
    if (force || page_index !== page_index_) {
      page_index = page_index_;
      $pageNumberInput.value = String(page_index + 1);
    }
  }

  function set_page_count(page_count_: number) {
    if (page_count !== page_count_) {
      page_count = page_count_;
      $totalPage.textContent = ` / ${page_count}`;
    }
  }

  return {
    $footer,
    $pageNumberInput,
    set_readonly,
    set_sidebar,
    set_page_index,
    set_page_count,
    on_new_page_index,
    on_toggle_preview,
    on_play,
    on_save_to_pdf,
  };
}
