import type { ILazyLoadInstance } from "vanilla-lazyload";
import type { PreviewPage } from "./typings";

import LazyLoad from "vanilla-lazyload";
import { append, h, hc, noop, wrap_class } from "../utils";

export function create_sidebar() {
  type NewPageIndexCallback = (newPageIndex: number) => void;
  let new_page_index_callback: NewPageIndexCallback = noop;
  const on_new_page_index = (callback: NewPageIndexCallback) => {
    new_page_index_callback = callback;
  };

  let destroyed = false;
  let readonly = false;
  let active = false;
  let pages: PreviewPage[] = [];
  let page_index = 0;

  const class_readonly = wrap_class("readonly");
  const class_preview_active = wrap_class("preview-active");

  const $content = hc("div", "content");

  const $previewMask = hc("div", "preview-mask");
  $previewMask.onclick = function on_click_preview_mask(ev) {
    if (readonly) return;
    if (ev.target !== $previewMask) return;
    set_active(false);
  };
  append($content, $previewMask);

  const $preview = hc("div", "preview");
  $preview.classList.add(wrap_class("tele-fancy-scrollbar"));
  $preview.onclick = function on_click_preview(ev) {
    if (readonly) return;
    const page_index = (ev.target as HTMLElement).dataset?.pageIndex;
    if (page_index) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      new_page_index_callback(Number(page_index));
      set_active(false);
    }
  };
  append($content, $preview);

  let lazyload: ILazyLoadInstance | undefined;

  function set_readonly(readonly_: boolean) {
    if (readonly !== readonly_) {
      readonly = readonly_;
      $content.classList.toggle(class_readonly, readonly);
    }
  }

  function set_active(active_: boolean) {
    if (active !== active_) {
      active = active_;
      $content.classList.toggle(class_preview_active, active);
      if (active && !lazyload) {
        lazyload = new LazyLoad({
          container: $preview,
          elements_selector: `.${wrap_class("preview-page>img")}`,
        });
      }
    }
  }

  function set_pages(pages_: PreviewPage[]) {
    if (pages !== pages_) {
      pages = pages_;

      const page_class = wrap_class("preview-page");
      const page_name_class = wrap_class("preview-page-name");

      pages.forEach((page, i) => {
        const pageIndex = String(i);

        const $page = h("a");
        $page.className = page_class + " " + wrap_class(`preview-page-${i}`);
        $page.href = "#";
        $page.dataset.pageIndex = pageIndex;

        const $name = h("span");
        $name.className = page_name_class;
        $name.textContent = String(i + 1);
        $name.dataset.pageIndex = pageIndex;

        const $img = h("img");
        $img.width = page.width;
        $img.height = page.height;
        $img.alt = `page-${i}`;
        $img.dataset.src = page.thumbnail;
        $img.dataset.pageIndex = pageIndex;

        append($page, $img);
        append($page, $name);
        append($preview, $page);
      });

      if (!destroyed) {
        lazyload?.update();
      }
    }
  }

  function set_page_index(page_index_: number, force = false) {
    if (force || page_index !== page_index_) {
      page_index = page_index_;
      const $page = $preview.querySelector<HTMLElement>(
        `.${wrap_class(`preview-page-${page_index}`)}`
      );
      if ($page) {
        $preview.scrollTo({ top: $page.offsetTop - 16 });
      }
    }
  }

  function destroy() {
    destroyed = true;
    lazyload?.destroy();
  }

  function get_active() {
    return active;
  }

  return {
    $content,
    $preview,
    set_readonly,
    set_active,
    get_active,
    set_pages,
    on_new_page_index,
    set_page_index,
    destroy,
  };
}
