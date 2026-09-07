/* ============================================================
   汎用ウィザードエンジン
   様式ごとの設定（steps・renderDocument）を渡して動かす。
   入力データは localStorage とファイル書き出し（JSON）にのみ保存され、
   どこにも送信されない（問い合わせ・通信不要）。
   ============================================================ */
(function (global) {
  "use strict";
  var T = global.Tantei;

  function TanteiWizard(config, mountEl) {
    this.config = config;
    this.mount = mountEl;
    this.stepIndex = 0;
    this.state = config.initialState ? JSON.parse(JSON.stringify(config.initialState)) : {};
    this.showingReview = false;
    this._boot();
  }

  TanteiWizard.prototype._boot = function () {
    var self = this;
    var saved = T.loadState(this.config.id);
    this.mount.innerHTML =
      '<div class="resume-banner" id="resumeBanner" style="display:none">' +
      '  <span>前回入力した内容が保存されています（<span id="resumeWhen"></span>）。続きから再開しますか？</span>' +
      '  <span>' +
      '    <button class="btn btn--sm" id="resumeYes">続きから再開する</button> ' +
      '    <button class="btn btn--sm btn--muted" id="resumeNo">最初から作成する</button>' +
      '  </span>' +
      '</div>' +
      '<div class="callout" style="margin-bottom:14px;font-size:.88rem">' +
      '  <strong>入力内容の保存について</strong>' +
      '  <p style="margin:.4em 0 0">入力した内容は、この端末（このパソコン・スマートフォン）にだけ自動的に保存されます。ブラウザを閉じても消えず、続きから再開できます。</p>' +
      '  <p style="margin:.4em 0 0"><strong>別のパソコンやスマートフォンで続きを入力したい場合</strong>や、<strong>念のため控えを残しておきたい場合</strong>は、下の「入力内容をファイルに保存する」でファイルをダウンロードしてください。続きを入力する端末で「ファイルから読み込む」を使うと、そのファイルから再開できます。</p>' +
      '</div>' +
      '<div class="toolbar no-print">' +
      '  <button class="btn btn--sm btn--ghost" id="btnExport" type="button">入力内容をファイルに保存する</button>' +
      '  <label class="btn btn--sm btn--ghost" style="cursor:pointer">ファイルから読み込んで再開する' +
      '    <input type="file" id="btnImport" accept="application/json" style="display:none">' +
      '  </label>' +
      '  <button class="btn btn--sm btn--muted" id="btnReset" type="button">最初からやり直す</button>' +
      '</div>' +
      '<div class="progress" id="progress"></div>' +
      '<div class="progress__label" id="progressLabel"></div>' +
      '<div id="stepHost" style="margin-top:22px"></div>';

    if (saved && saved.data) {
      var when = new Date(saved.savedAt);
      this.mount.querySelector("#resumeWhen").textContent =
        when.toLocaleDateString("ja-JP") + " " + when.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
      this.mount.querySelector("#resumeBanner").style.display = "flex";
      this.mount.querySelector("#resumeYes").addEventListener("click", function () {
        self.state = saved.data.state || {};
        self.stepIndex = saved.data.stepIndex || 0;
        self.showingReview = !!saved.data.showingReview;
        self.mount.querySelector("#resumeBanner").style.display = "none";
        self.render();
      });
      this.mount.querySelector("#resumeNo").addEventListener("click", function () {
        T.clearState(self.config.id);
        self.mount.querySelector("#resumeBanner").style.display = "none";
        self.render();
      });
    }

    this.mount.querySelector("#btnExport").addEventListener("click", function () {
      self._syncFromDOM();
      T.downloadJSON(self.config.exportName || (self.config.id + ".json"), {
        tool: "tantei-todokede", formId: self.config.id, savedAt: new Date().toISOString(),
        stepIndex: self.stepIndex, showingReview: self.showingReview, state: self.state
      });
    });
    this.mount.querySelector("#btnImport").addEventListener("change", function (e) {
      var f = e.target.files[0];
      if (!f) return;
      T.readJSONFile(f).then(function (obj) {
        if (!obj || !obj.state) { alert("このファイルは読み込めませんでした。"); return; }
        self.state = obj.state;
        self.stepIndex = obj.stepIndex || 0;
        self.showingReview = !!obj.showingReview;
        self._persist();
        self.render();
      }).catch(function () { alert("このファイルは読み込めませんでした。"); });
    });
    this.mount.querySelector("#btnReset").addEventListener("click", function () {
      if (!confirm("入力した内容をすべて削除して最初からやり直します。よろしいですか？")) return;
      self.state = {};
      self.stepIndex = 0;
      self.showingReview = false;
      T.clearState(self.config.id);
      self.render();
    });

    this.render();
  };

  TanteiWizard.prototype._persist = function () {
    T.saveState(this.config.id, { state: this.state, stepIndex: this.stepIndex, showingReview: this.showingReview });
  };

  TanteiWizard.prototype._visibleFields = function (step) {
    var self = this;
    return step.fields.filter(function (f) { return !f.showIf || f.showIf(self.state); });
  };

  // ステップ自体の showIf に加えて、フィールドが1つも表示されない
  // （＝実質空っぽの）ステップも「非表示」として扱う。
  TanteiWizard.prototype._isStepVisible = function (step) {
    if (typeof step.showIf === "function" && !step.showIf(this.state)) return false;
    if (step.fields && step.fields.length > 0 && this._visibleFields(step).length === 0) return false;
    return true;
  };

  // fromIndex から direction(+1/-1) 方向に、表示可能な最初のステップの
  // インデックスを返す。見つからない場合は範囲外の値を返す。
  TanteiWizard.prototype._findVisibleStep = function (fromIndex, direction) {
    var steps = this.config.steps;
    var i = fromIndex;
    while (i >= 0 && i <= steps.length - 1) {
      if (this._isStepVisible(steps[i])) return i;
      i += direction;
    }
    return direction > 0 ? steps.length : -1;
  };

  TanteiWizard.prototype._lastVisibleStepIndex = function () {
    return this._findVisibleStep(this.config.steps.length - 1, -1);
  };

  TanteiWizard.prototype._renderProgress = function () {
    var self = this;
    var steps = this.config.steps;
    var wrap = this.mount.querySelector("#progress");
    wrap.innerHTML = "";
    var visibleIdx = [];
    steps.forEach(function (s, i) { if (self._isStepVisible(s)) visibleIdx.push(i); });
    var posOfCurrent = visibleIdx.indexOf(this.stepIndex);
    visibleIdx.forEach(function (i, pos) {
      var s = steps[i];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "progress__item" + (pos < posOfCurrent || self.showingReview ? " is-done" : "") + (i === self.stepIndex && !self.showingReview ? " is-current" : "");
      b.title = s.title;
      b.addEventListener("click", function () {
        self._syncFromDOM();
        self.showingReview = false;
        self.stepIndex = i;
        self._persist();
        self.render();
      });
      wrap.appendChild(b);
    });
    var label = this.showingReview
      ? "確認・完成"
      : ("STEP " + (posOfCurrent + 1) + " / " + visibleIdx.length + "　" + steps[this.stepIndex].title);
    this.mount.querySelector("#progressLabel").textContent = label;
  };

  // ---------------- フィールド描画 ----------------
  TanteiWizard.prototype._fieldValue = function (id) {
    return this.state[id];
  };

  function fieldWrap(f, innerHtml, errorMsg) {
    return (
      '<div class="field' + (errorMsg ? " has-error" : "") + '" data-field="' + f.id + '">' +
      '<label class="field-label">' + T.esc(f.label) + (f.required ? '<span class="req">必須</span>' : "") + "</label>" +
      (f.help ? '<div class="help">' + f.help + "</div>" : "") +
      innerHtml +
      '<div class="field-error">' + (errorMsg || "") + "</div>" +
      "</div>"
    );
  }

  TanteiWizard.prototype._renderOneField = function (f) {
    var v = this._fieldValue(f.id);
    var html = "";
    if (f.type === "text" || f.type === "tel") {
      html = '<input type="' + (f.type === "tel" ? "tel" : "text") + '" id="fld_' + f.id + '" data-id="' + f.id + '" value="' + T.esc(v || "") + '" placeholder="' + T.esc(f.placeholder || "") + '">';
    } else if (f.type === "textarea") {
      html = '<textarea id="fld_' + f.id + '" data-id="' + f.id + '" placeholder="' + T.esc(f.placeholder || "") + '">' + T.esc(v || "") + "</textarea>";
    } else if (f.type === "select") {
      var opts = ['<option value="">選択してください</option>'].concat(
        f.options.map(function (o) {
          return '<option value="' + T.esc(o.value) + '"' + (v === o.value ? " selected" : "") + ">" + T.esc(o.label) + "</option>";
        })
      );
      html = '<select id="fld_' + f.id + '" data-id="' + f.id + '">' + opts.join("") + "</select>";
    } else if (f.type === "prefecture") {
      var popts = ['<option value="">選択してください</option>'].concat(
        T.PREF_DATA.map(function (p) {
          return '<option value="' + p.name + '"' + (v === p.name ? " selected" : "") + ">" + p.name + "</option>";
        })
      );
      html = '<select id="fld_' + f.id + '" data-id="' + f.id + '">' + popts.join("") + "</select>";
      if (v) {
        html += '<div class="help">あて先：<strong>' + T.esc(T.publicSafetyCommissionName(v)) + '</strong>　提出先：営業所の所在地を管轄する警察署（生活安全課）</div>';
      }
    } else if (f.type === "radio") {
      html = '<div class="radio-group">' + f.options.map(function (o) {
        var checked = v === o.value;
        return '<label class="radio-row' + (checked ? " is-checked" : "") + '"><input type="radio" name="fld_' + f.id + '" data-id="' + f.id + '" value="' + T.esc(o.value) + '"' + (checked ? " checked" : "") + "> " + T.esc(o.label) + "</label>";
      }).join("") + "</div>";
    } else if (f.type === "checkbox") {
      var on = !!v;
      html = '<label class="check-row' + (on ? " is-checked" : "") + '"><input type="checkbox" data-id="' + f.id + '"' + (on ? " checked" : "") + "> " + T.esc(f.checkboxLabel || "") + "</label>";
    } else if (f.type === "eradate") {
      var ev = v || {};
      if (!ev.era) {
        ev.era = "令和";
        this.state[f.id] = ev;
      }
      html =
        '<div class="eradate" data-eradate="' + f.id + '">' +
        '<select data-id="' + f.id + '.era">' +
        T.ERA_OPTIONS.map(function (o) {
          return '<option value="' + o.v + '"' + (ev.era === o.v ? " selected" : "") + ">" + o.v + "</option>";
        }).join("") +
        "</select>" +
        '<input type="number" min="1" max="99" data-id="' + f.id + '.y" value="' + T.esc(ev.y || "") + '" placeholder="年"><span>年</span>' +
        '<input type="number" min="1" max="12" data-id="' + f.id + '.m" value="' + T.esc(ev.m || "") + '" placeholder="月"><span>月</span>' +
        '<input type="number" min="1" max="31" data-id="' + f.id + '.d" value="' + T.esc(ev.d || "") + '" placeholder="日"><span>日</span>' +
        "</div>";
    } else if (f.type === "repeater") {
      var items = v || [];
      var self = this;
      html = '<div data-repeater="' + f.id + '">';
      items.forEach(function (item, idx) {
        html += '<div class="repeater-item"><button type="button" class="repeater-remove" data-rep-remove="' + f.id + '" data-idx="' + idx + '">削除</button>';
        html += '<div class="repeater-item__title">' + T.esc(f.itemLabel ? f.itemLabel(idx) : "項目" + (idx + 1)) + "</div>";
        f.template.forEach(function (sub) {
          html += self._renderSubField(f.id, idx, sub, item[sub.id]);
        });
        html += "</div>";
      });
      html += '<button type="button" class="repeater-add" data-rep-add="' + f.id + '">' + T.esc(f.addLabel || "＋ 追加する") + "</button>";
      html += "</div>";
    }
    return fieldWrap(f, html, f._error);
  };

  TanteiWizard.prototype._renderSubField = function (repId, idx, sub, val) {
    var name = repId + "." + idx + "." + sub.id;
    if (sub.type === "select") {
      var opts = ['<option value="">選択してください</option>'].concat(
        sub.options.map(function (o) { return '<option value="' + T.esc(o.value) + '"' + (val === o.value ? " selected" : "") + ">" + T.esc(o.label) + "</option>"; })
      );
      return '<div class="field"><label class="field-label">' + T.esc(sub.label) + '</label><select data-rep-field="' + name + '">' + opts.join("") + "</select></div>";
    }
    if (sub.type === "eradate") {
      var ev = val || {};
      if (!ev.era) {
        ev.era = "令和";
        var arrRef = this.state[repId] = this.state[repId] || [];
        arrRef[idx] = arrRef[idx] || {};
        arrRef[idx][sub.id] = ev;
      }
      return (
        '<div class="field"><label class="field-label">' + T.esc(sub.label) + '</label><div class="eradate">' +
        '<select data-rep-field="' + name + '.era">' +
        T.ERA_OPTIONS.map(function (o) { return '<option value="' + o.v + '"' + (ev.era === o.v ? " selected" : "") + ">" + o.v + "</option>"; }).join("") +
        "</select>" +
        '<input type="number" data-rep-field="' + name + '.y" value="' + T.esc(ev.y || "") + '" placeholder="年"><span>年</span>' +
        '<input type="number" data-rep-field="' + name + '.m" value="' + T.esc(ev.m || "") + '" placeholder="月"><span>月</span>' +
        '<input type="number" data-rep-field="' + name + '.d" value="' + T.esc(ev.d || "") + '" placeholder="日"><span>日</span>' +
        "</div></div>"
      );
    }
    return '<div class="field"><label class="field-label">' + T.esc(sub.label) + '</label><input type="text" data-rep-field="' + name + '" value="' + T.esc(val || "") + '" placeholder="' + T.esc(sub.placeholder || "") + '"></div>';
  };

  // ---------------- ステップ描画 ----------------
  TanteiWizard.prototype._renderStep = function () {
    var self = this;
    var step = this.config.steps[this.stepIndex];
    var host = this.mount.querySelector("#stepHost");
    var fields = this._visibleFields(step);
    host.innerHTML =
      '<div class="step-panel">' +
      "<h2>" + T.esc(step.title) + "</h2>" +
      (step.desc ? '<div class="step-desc">' + step.desc + "</div>" : "") +
      fields.map(function (f) { return self._renderOneField(f); }).join("") +
      '<div class="step-nav">' +
      '<button class="btn btn--muted" id="navBack" type="button"' + (this.stepIndex === 0 ? " disabled" : "") + ">← 前へ戻る</button>" +
      '<button class="btn" id="navNext" type="button">' + (this._findVisibleStep(this.stepIndex + 1, 1) >= this.config.steps.length ? "内容を確認する →" : "次へ進む →") + "</button>" +
      "</div>" +
      "</div>";

    this._wireStepEvents(host, step);

    host.querySelector("#navBack").addEventListener("click", function () {
      self._syncFromDOM();
      var prev = self._findVisibleStep(self.stepIndex - 1, -1);
      self.stepIndex = prev >= 0 ? prev : 0;
      self._persist();
      self.render();
      global.scrollTo({ top: 0, behavior: "smooth" });
    });
    host.querySelector("#navNext").addEventListener("click", function () {
      self._syncFromDOM();
      var errors = self._validateStep(step);
      if (errors.length) {
        self.render();
        var firstErr = host.querySelector(".has-error");
        if (firstErr) firstErr.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      var next = self._findVisibleStep(self.stepIndex + 1, 1);
      if (next >= self.config.steps.length) {
        self.showingReview = true;
      } else {
        self.stepIndex = next;
      }
      self._persist();
      self.render();
      global.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  TanteiWizard.prototype._wireStepEvents = function (host, step) {
    var self = this;

    host.addEventListener("input", function (e) {
      var id = e.target.getAttribute("data-id");
      if (!id) return;
      if (id.indexOf(".") > -1) {
        var parts = id.split(".");
        self.state[parts[0]] = self.state[parts[0]] || {};
        self.state[parts[0]][parts[1]] = e.target.value;
      } else if (e.target.type !== "checkbox" && e.target.tagName !== "SELECT") {
        self.state[id] = e.target.value;
      }
      self._persist();
    });

    host.addEventListener("change", function (e) {
      var needsRerender = false;
      var id = e.target.getAttribute("data-id");
      if (id) {
        if (e.target.type === "checkbox") {
          self.state[id] = e.target.checked;
          needsRerender = true;
        } else if (e.target.tagName === "SELECT" || e.target.type === "radio") {
          if (id.indexOf(".") > -1) {
            var parts = id.split(".");
            self.state[parts[0]] = self.state[parts[0]] || {};
            self.state[parts[0]][parts[1]] = e.target.value;
          } else {
            self.state[id] = e.target.value;
          }
          needsRerender = true;
        }
      }
      var repField = e.target.getAttribute("data-rep-field");
      if (repField) {
        self._setRepField(repField, e.target.type === "checkbox" ? e.target.checked : e.target.value);
      }
      self._persist();
      if (needsRerender) self.render();
    });

    host.addEventListener("click", function (e) {
      var addId = e.target.getAttribute("data-rep-add");
      if (addId) {
        var f = self._findField(addId);
        self.state[addId] = self.state[addId] || [];
        var blank = {};
        f.template.forEach(function (s) { blank[s.id] = s.type === "eradate" ? {} : ""; });
        self.state[addId].push(blank);
        self._persist();
        self.render();
      }
      var remId = e.target.getAttribute("data-rep-remove");
      if (remId) {
        var idx = parseInt(e.target.getAttribute("data-idx"), 10);
        self.state[remId].splice(idx, 1);
        self._persist();
        self.render();
      }
    });
  };

  TanteiWizard.prototype._setRepField = function (path, value) {
    // path形式: repId.idx.subId  もしくは repId.idx.subId.subsub
    var parts = path.split(".");
    var repId = parts[0], idx = parseInt(parts[1], 10);
    var arr = this.state[repId] = this.state[repId] || [];
    arr[idx] = arr[idx] || {};
    if (parts.length === 3) {
      arr[idx][parts[2]] = value;
    } else if (parts.length === 4) {
      arr[idx][parts[2]] = arr[idx][parts[2]] || {};
      arr[idx][parts[2]][parts[3]] = value;
    }
  };

  TanteiWizard.prototype._findField = function (id) {
    for (var s = 0; s < this.config.steps.length; s++) {
      for (var i = 0; i < this.config.steps[s].fields.length; i++) {
        if (this.config.steps[s].fields[i].id === id) return this.config.steps[s].fields[i];
      }
    }
    return null;
  };

  TanteiWizard.prototype._syncFromDOM = function () {
    // input イベントで都度反映しているため、ここでは何もしなくても状態は最新。
    // (テキスト系は input、選択系は change で反映済み)
  };

  TanteiWizard.prototype._validateStep = function (step) {
    var self = this;
    var errors = [];
    this._visibleFields(step).forEach(function (f) {
      f._error = "";
      if (!f.required) return;
      var v = self.state[f.id];
      var missing = false;
      if (f.type === "eradate") missing = !T.eraDateFilled(v);
      else if (f.type === "repeater") missing = !(v && v.length);
      else if (f.type === "checkbox") missing = false;
      else missing = !v || !String(v).trim();
      if (missing) {
        f._error = "この項目を入力してください。";
        errors.push(f.id);
      }
      if (f.pattern && v && !f.pattern.test(v)) {
        f._error = f.patternMsg || "入力形式をご確認ください。";
        errors.push(f.id);
      }
    });
    return errors;
  };

  // ---------------- レビュー画面 ----------------
  TanteiWizard.prototype._formatValueForReview = function (f, v) {
    if (v == null || v === "") return "（未入力）";
    if (f.type === "eradate") return T.eraDateText(v) || "（未入力）";
    if (f.type === "checkbox") return v ? "はい" : "いいえ";
    if (f.type === "select" || f.type === "radio") {
      var opt = (f.options || []).filter(function (o) { return o.value === v; })[0];
      return opt ? opt.label : v;
    }
    if (f.type === "prefecture") return v + "（あて先：" + T.publicSafetyCommissionName(v) + "）";
    if (f.type === "repeater") return (v || []).length + "件";
    return String(v).replace(/\n/g, "<br>");
  };

  TanteiWizard.prototype._renderReview = function () {
    var self = this;
    var host = this.mount.querySelector("#stepHost");
    var html = "";
    this.config.steps.forEach(function (step, si) {
      var fields = self._visibleFields(step);
      if (!fields.length) return;
      html += '<div class="review-section"><div class="review-section__head"><h3>' + T.esc(step.title) + '</h3><button class="btn btn--sm btn--ghost no-print" data-jump="' + si + '">編集する</button></div>';
      html += '<table class="review-table"><tbody>';
      fields.forEach(function (f) {
        if (f.type === "repeater") {
          var items = self.state[f.id] || [];
          if (!items.length) {
            html += "<tr><th>" + T.esc(f.label) + "</th><td>（未登録）</td></tr>";
          } else {
            items.forEach(function (it, idx) {
              var line = f.template.map(function (s) {
                var val = it[s.id];
                if (s.type === "eradate") val = T.eraDateText(val);
                return T.esc(s.label) + "：" + T.esc(val || "（未入力）");
              }).join("／");
              html += "<tr><th>" + T.esc(f.itemLabel ? f.itemLabel(idx) : f.label + (idx + 1)) + "</th><td>" + line + "</td></tr>";
            });
          }
        } else {
          html += "<tr><th>" + T.esc(f.label) + "</th><td>" + self._formatValueForReview(f, self.state[f.id]) + "</td></tr>";
        }
      });
      html += "</tbody></table></div>";
    });

    var docHtml = this.config.renderDocument ? this.config.renderDocument(this.state, T) : "";

    host.innerHTML =
      '<div class="callout no-print"><h3>入力内容の確認</h3><p>内容に誤りがないかご確認ください。修正したい項目は「編集する」から該当のステップに戻れます。書類は下部にプレビューされます。</p></div>' +
      html +
      '<div class="toolbar no-print">' +
      '<button class="btn" id="btnPrint" type="button">印刷してPDFとして保存する</button>' +
      '<button class="btn btn--ghost" id="backToEdit" type="button">← 入力に戻る</button>' +
      "</div>" +
      '<h2 class="no-print" style="margin-top:36px">完成した届出書（このまま印刷・PDF保存できます）</h2>' +
      '<div class="doc-sheet" id="docSheet">' + docHtml + "</div>";

    host.querySelectorAll("[data-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        self.showingReview = false;
        self.stepIndex = parseInt(btn.getAttribute("data-jump"), 10);
        self._persist();
        self.render();
        global.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
    host.querySelector("#btnPrint").addEventListener("click", function () { global.print(); });
    host.querySelector("#backToEdit").addEventListener("click", function () {
      self.showingReview = false;
      self.stepIndex = self._lastVisibleStepIndex();
      self._persist();
      self.render();
      global.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  TanteiWizard.prototype.render = function () {
    // 状態の変化などで、現在のステップが空欄（非表示対象）になっていた場合に備えた保険。
    if (!this.showingReview && !this._isStepVisible(this.config.steps[this.stepIndex])) {
      var fixed = this._findVisibleStep(this.stepIndex, -1);
      this.stepIndex = fixed >= 0 ? fixed : this._findVisibleStep(0, 1);
    }
    this._renderProgress();
    if (this.showingReview) this._renderReview();
    else this._renderStep();
  };

  global.TanteiWizard = TanteiWizard;
})(window);
