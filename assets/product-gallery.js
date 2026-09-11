/* ===================================
   PRODUCT GALLERY
   Vanilla JS only - no jQuery.
   Handles: hotspot -> shared popup, dynamic color/size rendering
   from real variant data, live variant resolution, custom dropdown,
   and Add to Cart. Each .product-gallery section on the page is
   initialised independently, so multiple instances never share state.
   =================================== */

   
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ========================================
     INIT
     ======================================== */

  function init() {
    var sections = document.querySelectorAll('[data-component="product-gallery"]');
    sections.forEach(setupSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ========================================
     PER-SECTION SETUP
     ======================================== */

  function setupSection(section) {
    var overlay = section.querySelector('[data-quick-add-overlay]');
    if (!overlay) return;

    var popup = overlay.querySelector('[data-quick-add-popup]');
    var elements = {
      overlay: overlay,
      popup: popup,
      image: overlay.querySelector('[data-popup-image]'),
      title: overlay.querySelector('[data-popup-title]'),
      price: overlay.querySelector('[data-popup-price]'),
      description: overlay.querySelector('[data-popup-description]'),
      colorWrap: overlay.querySelector('[data-popup-color-wrap]'),
      colorLabel: overlay.querySelector('[data-popup-color-label]'),
      colorOptions: overlay.querySelector('[data-popup-color-options]'),
      sizeWrap: overlay.querySelector('[data-popup-size-wrap]'),
      sizeLabel: overlay.querySelector('[data-popup-size-label]'),
      dropdown: overlay.querySelector('[data-popup-size-dropdown]'),
      dropdownToggle: overlay.querySelector('[data-dropdown-toggle]'),
      dropdownValue: overlay.querySelector('[data-dropdown-value]'),
      dropdownList: overlay.querySelector('[data-dropdown-list]'),
      status: overlay.querySelector('[data-popup-status]'),
      addToCartButton: overlay.querySelector('[data-action="add-to-cart"]'),
      addToCartLabel: overlay.querySelector('[data-add-to-cart-label]')
    };

    // Per-section state. Re-set every time a new product's popup opens.
    var state = {
      product: null,
      optionNames: [],
      selectedOptions: {},
      activeTrigger: null,
      isSubmitting: false,
      colorIndex: -1,
      sizeIndex: -1
    };

    var descriptionLimit = parseInt(section.getAttribute('data-description-limit'), 10) || 120;

    /* ----------------------------------------
       OPEN / CLOSE
       ---------------------------------------- */

    function openQuickAdd(card, triggerEl) {
      var jsonTag = card.querySelector('[data-product-json]');
      if (!jsonTag) return;

      var product;
      try {
        product = JSON.parse(jsonTag.textContent);
      } catch (err) {
        return; // malformed product data - fail silently rather than break the page
      }

      state.product = product;
      state.optionNames = product.optionNames || [];
      state.selectedOptions = {};
      state.activeTrigger = triggerEl;
      state.isSubmitting = false;

      renderPopup(product, descriptionLimit);
      preselectDefaultOptions(product);
      refreshVariantUI();

      overlay.hidden = false;
      // Force layout before adding the class so the transition actually runs
      // (removing [hidden] and adding a class in the same tick can collapse
      // to no-transition in some browsers otherwise).
      requestAnimationFrame(function () {
        overlay.classList.add('is-open');
      });

      document.addEventListener('keydown', handleKeydown);
    }

    function closeQuickAdd() {
      overlay.classList.remove('is-open');
      closeDropdown();

      var finish = function () {
        overlay.hidden = true;
        if (state.activeTrigger) {
          state.activeTrigger.focus();
        }
      };

      if (prefersReducedMotion) {
        finish();
      } else {
        popup.addEventListener('transitionend', finish, { once: true });
      }

      document.removeEventListener('keydown', handleKeydown);
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        closeQuickAdd();
        return;
      }
      if (event.key === 'Tab') {
        trapFocus(event);
      }
    }

    function trapFocus(event) {
      var focusable = popup.querySelectorAll(
        'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    /* ----------------------------------------
       RENDER STATIC PRODUCT INFO
       ---------------------------------------- */

    function renderPopup(product, limit) {
      elements.image.src = product.image || '';
      elements.image.alt = product.title || '';
      elements.title.textContent = product.title || '';
      elements.description.textContent = truncateText(product.description || '', limit);
      setStatus('', null);
      elements.addToCartButton.disabled = false;
      setAddToCartLabel('Add to Cart');

      var colorIndex = findOptionIndex(product.optionNames, 'color');
      var sizeIndex = findOptionIndex(product.optionNames, 'size');

      renderColorOptions(product, colorIndex);
      renderSizeOptions(product, sizeIndex);

      state.colorIndex = colorIndex;
      state.sizeIndex = sizeIndex;
    }

    function findOptionIndex(optionNames, keyword) {
      if (!optionNames) return -1;
      for (var i = 0; i < optionNames.length; i++) {
        if (optionNames[i] && optionNames[i].toLowerCase().indexOf(keyword) !== -1) {
          return i;
        }
      }
      return -1;
    }

    function uniqueValuesForIndex(product, index) {
      if (index === -1) return [];
      var seen = {};
      var values = [];
      product.variants.forEach(function (variant) {
        var value = variant.options[index];
        if (value && !seen[value]) {
          seen[value] = true;
          values.push(value);
        }
      });
      return values;
    }

    function renderColorOptions(product, colorIndex) {
      elements.colorOptions.innerHTML = '';

      if (colorIndex === -1) {
        elements.colorWrap.hidden = true;
        return;
      }

      elements.colorWrap.hidden = false;
      if (product.optionNames[colorIndex]) {
        elements.colorLabel.textContent = product.optionNames[colorIndex];
      }

      uniqueValuesForIndex(product, colorIndex).forEach(function (value) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'product-gallery__color-option';
        button.textContent = value;
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('data-value', value);

        // Selected fill uses the option's own value as a real CSS color
        // when the browser recognises it (e.g. "Blue", "Black", "#1e3a8a").
        // Falls back to the plain neutral style when it isn't a valid color.
        if (window.CSS && window.CSS.supports && window.CSS.supports('color', value)) {
          button.dataset.swatchColor = value;
        }

        button.addEventListener('click', function () {
          selectOption(colorIndex, value);
        });

        elements.colorOptions.appendChild(button);
      });
    }

    function renderSizeOptions(product, sizeIndex) {
      elements.dropdownList.innerHTML = '';

      if (sizeIndex === -1) {
        elements.sizeWrap.hidden = true;
        return;
      }

      elements.sizeWrap.hidden = false;
      if (product.optionNames[sizeIndex]) {
        elements.sizeLabel.textContent = product.optionNames[sizeIndex];
      }
      elements.dropdownValue.textContent = 'Choose your size';

      uniqueValuesForIndex(product, sizeIndex).forEach(function (value) {
        var li = document.createElement('li');
        li.setAttribute('role', 'presentation');

        var option = document.createElement('button');
        option.type = 'button';
        option.className = 'product-gallery__dropdown-option';
        option.textContent = value;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.setAttribute('data-value', value);

        option.addEventListener('click', function () {
          selectOption(sizeIndex, value);
          closeDropdown();
        });

        li.appendChild(option);
        elements.dropdownList.appendChild(li);
      });
    }

    function preselectDefaultOptions(product) {
      // Pick the first available variant's option values as sensible
      // defaults, if one exists - avoids opening on a dead combination.
      var firstAvailable = product.variants.filter(function (v) {
        return v.available;
      })[0];

      if (!firstAvailable) return;

      firstAvailable.options.forEach(function (value, index) {
        state.selectedOptions[index] = value;
      });

      // Reflect the preselected defaults onto the actual buttons/dropdown -
      // without this, state knows the selection but the DOM (and therefore
      // the color fill / dropdown value the shopper actually sees) doesn't,
      // until they manually click something.
      syncSelectionUI();
    }

    // Single source of truth for reflecting state.selectedOptions onto the
    // DOM (button aria-pressed/aria-selected + dropdown display value).
    // Called on preselect AND on every click, so the two can never drift
    // out of sync with each other again.
    function syncSelectionUI() {
      var selectedColor = state.selectedOptions[state.colorIndex];
      elements.colorOptions.querySelectorAll('button').forEach(function (btn) {
        var isSelected = btn.getAttribute('data-value') === selectedColor;
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      });

      var selectedSize = state.selectedOptions[state.sizeIndex];
      elements.dropdownList.querySelectorAll('button').forEach(function (btn) {
        var isSelected = btn.getAttribute('data-value') === selectedSize;
        btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      });
      if (selectedSize) {
        elements.dropdownValue.textContent = selectedSize;
      }
    }

    /* ----------------------------------------
       SELECTION + VARIANT RESOLUTION
       ---------------------------------------- */

    function selectOption(index, value) {
      var previousValue = state.selectedOptions[index];
      var container = index === state.colorIndex
        ? elements.colorOptions
        : (index === state.sizeIndex ? elements.dropdownList : null);
      var direction = (container && previousValue !== undefined && previousValue !== value)
        ? getSlideDirection(container, previousValue, value)
        : null;

      state.selectedOptions[index] = value;
      syncSelectionUI();
      refreshVariantUI();

      if (direction && !prefersReducedMotion) {
        animatePriceChange(direction);
      }
    }

    // Direction follows the clicked option's position relative to the one
    // it replaces: picking an option to the LEFT of the current selection
    // slides the price left; picking one to the RIGHT slides it right.
    // Matches the horizontal tab-switch motion in the Featured Opportunities
    // reference (carpentertechnology.com careers page, tabs module).
    function getSlideDirection(container, oldValue, newValue) {
      var items = Array.prototype.slice.call(container.querySelectorAll('[data-value]'));
      var oldIndex = -1;
      var newIndex = -1;
      items.forEach(function (item, i) {
        var v = item.getAttribute('data-value');
        if (v === oldValue) oldIndex = i;
        if (v === newValue) newIndex = i;
      });
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;
      return newIndex < oldIndex ? 'left' : 'right';
    }

    // Snaps the price to an off-position (matching the chosen direction)
    // with zero transition, forces a reflow, then lets the CSS transition
    // (defined in product-gallery.css) carry it back to rest - a clean
    // slide-in for whatever the new value already is, with no dual-element
    // crossfade needed.
    function animatePriceChange(direction) {
      var el = elements.price;
      var offset = direction === 'left' ? '16px' : '-16px';

      el.style.transition = 'none';
      el.style.transform = 'translateX(' + offset + ')';
      el.style.opacity = '0';

      // Force reflow so the "off" position is actually painted before we
      // transition back to rest - otherwise the browser can coalesce both
      // style changes into one frame and skip the animation entirely.
      void el.offsetWidth;

      el.style.transition = '';
      requestAnimationFrame(function () {
        el.style.transform = 'translateX(0)';
        el.style.opacity = '1';
      });
    }

    function findMatchingVariant() {
      var product = state.product;
      if (!product) return null;

      var found = null;
      product.variants.some(function (variant) {
        var isMatch = variant.options.every(function (value, index) {
          var selected = state.selectedOptions[index];
          return selected === undefined || selected === value;
        });
        if (isMatch) {
          found = variant;
        }
        return isMatch;
      });
      return found;
    }

    // Cross-filters: for each axis, a value is disabled only if no
    // available variant exists once the OTHER currently selected
    // options are taken into account - the standard variant-picker
    // pattern, so choices stay in sync with each other.
    function refreshVariantUI() {
      var product = state.product;
      if (!product) return;

      applyAvailability(elements.colorOptions.querySelectorAll('button'), state.colorIndex);
      applyAvailability(elements.dropdownList.querySelectorAll('button'), state.sizeIndex);

      var match = findMatchingVariant();
      renderColorSwatchStyles();

      if (match) {
        elements.price.textContent = match.price;
        if (match.available) {
          elements.addToCartButton.disabled = false;
          setAddToCartLabel('Add to Cart');
        } else {
          elements.addToCartButton.disabled = true;
          setAddToCartLabel('Sold Out');
        }
      } else {
        elements.addToCartButton.disabled = true;
        setAddToCartLabel('Unavailable');
      }
    }

    function applyAvailability(buttons, ownIndex) {
      if (ownIndex === -1) return;

      buttons.forEach(function (button) {
        var value = button.getAttribute('data-value');
        var hypothetical = Object.assign({}, state.selectedOptions);
        hypothetical[ownIndex] = value;

        var exists = state.product.variants.some(function (variant) {
          return variant.available && variant.options.every(function (v, i) {
            var sel = hypothetical[i];
            return sel === undefined || sel === v;
          });
        });

        button.disabled = !exists;
      });
    }

    // Applies the real-color background + auto-contrast text color to
    // color option buttons, computed via a throwaway element rather than
    // a hardcoded name-to-hex table (works for any CSS-valid color name).
    function renderColorSwatchStyles() {
      if (!renderColorSwatchStyles.probe) {
        renderColorSwatchStyles.probe = document.createElement('div');
      }
      var probe = renderColorSwatchStyles.probe;
      probe.style.display = 'none';
      document.body.appendChild(probe);

      elements.colorOptions.querySelectorAll('button').forEach(function (button) {
        var isSelected = button.getAttribute('aria-pressed') === 'true';
        var colorValue = button.dataset.swatchColor;

        if (isSelected && colorValue) {
          probe.style.color = '';
          probe.style.color = colorValue;
          var computed = getComputedStyle(probe).color;
          button.style.backgroundColor = colorValue;
          button.style.borderColor = colorValue;
          button.style.color = getContrastTextColor(computed);
        } else {
          button.style.backgroundColor = '';
          button.style.borderColor = '';
          button.style.color = '';
        }
      });

      document.body.removeChild(probe);
    }

    function getContrastTextColor(rgbString) {
      var match = rgbString.match(/\d+(\.\d+)?/g);
      if (!match || match.length < 3) return '#111111';

      var r = Number(match[0]) / 255;
      var g = Number(match[1]) / 255;
      var b = Number(match[2]) / 255;

      var toLinear = function (c) {
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };

      var luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
      return luminance > 0.5 ? '#111111' : '#ffffff';
    }

    /* ----------------------------------------
       DROPDOWN
       ---------------------------------------- */

    function openDropdown() {
      elements.dropdownList.hidden = false;
      requestAnimationFrame(function () {
        elements.dropdownList.classList.add('is-open');
      });
      elements.dropdownToggle.setAttribute('aria-expanded', 'true');
    }

    function closeDropdown() {
      elements.dropdownList.classList.remove('is-open');
      elements.dropdownToggle.setAttribute('aria-expanded', 'false');

      var finish = function () {
        elements.dropdownList.hidden = true;
      };
      if (prefersReducedMotion) {
        finish();
      } else {
        elements.dropdownList.addEventListener('transitionend', finish, { once: true });
      }
    }

    function isDropdownOpen() {
      return !elements.dropdownList.hidden;
    }

    /* ----------------------------------------
       TEXT HELPERS
       ---------------------------------------- */

    function truncateText(text, limit) {
      if (!text || text.length <= limit) return text;
      var trimmed = text.slice(0, limit);
      var lastSpace = trimmed.lastIndexOf(' ');
      if (lastSpace > 0) {
        trimmed = trimmed.slice(0, lastSpace);
      }
      return trimmed.replace(/[\s,.;:-]+$/, '') + '\u2026';
    }

    function setStatus(message, stateName) {
      elements.status.textContent = message;
      if (stateName) {
        elements.status.setAttribute('data-state', stateName);
      } else {
        elements.status.removeAttribute('data-state');
      }
    }

    function setAddToCartLabel(label) {
      elements.addToCartLabel.textContent = label;
    }

    /* ----------------------------------------
       ADD TO CART
       ---------------------------------------- */

    function handleAddToCart() {
      if (state.isSubmitting) return;

      var variant = findMatchingVariant();
      if (!variant || !variant.available) {
        setStatus('This combination is unavailable.', 'error');
        return;
      }

      var items = [{ id: variant.id, quantity: 1 }];

      state.isSubmitting = true;
      elements.addToCartButton.disabled = true;
      setAddToCartLabel('Adding\u2026');
      setStatus('', null);

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items })
      })
        .then(function (response) {
          if (!response.ok) {
            return response.json().then(function (data) {
              throw new Error(data.description || 'Could not add to cart.');
            });
          }
          return response.json();
        })
        .then(function () {
          setAddToCartLabel('Added!');
          setStatus('Added to cart.', 'success');
          document.dispatchEvent(new CustomEvent('product-gallery:added-to-cart', {
            detail: { items: items }
          }));

          window.setTimeout(function () {
            setAddToCartLabel('Add to Cart');
            elements.addToCartButton.disabled = false;
            state.isSubmitting = false;
          }, 1500);
        })
        .catch(function (err) {
          setStatus(err.message || 'Something went wrong. Please try again.', 'error');
          setAddToCartLabel('Add to Cart');
          elements.addToCartButton.disabled = false;
          state.isSubmitting = false;
        });
    }

    /* ----------------------------------------
       EVENT WIRING (scoped to this section/overlay only)
       ---------------------------------------- */

    section.querySelectorAll('[data-action="open-quick-add"]').forEach(function (button) {
      button.addEventListener('click', function () {
        var card = button.closest('.product-gallery__card');
        if (card) openQuickAdd(card, button);
      });
    });

    overlay.querySelector('[data-action="close-quick-add"]').addEventListener('click', closeQuickAdd);

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeQuickAdd();
    });

    elements.dropdownToggle.addEventListener('click', function () {
      if (isDropdownOpen()) {
        closeDropdown();
      } else {
        openDropdown();
      }
    });

    document.addEventListener('click', function (event) {
      if (!isDropdownOpen()) return;
      if (!elements.dropdown.contains(event.target)) {
        closeDropdown();
      }
    });

    elements.addToCartButton.addEventListener('click', handleAddToCart);

    // Cleanup on Shopify section unload (theme editor)
    document.addEventListener('shopify:section:unload', function (event) {
      if (event.detail && event.detail.sectionId === section.dataset.sectionId) {
        document.removeEventListener('keydown', handleKeydown);
      }
    });
  }
})();
