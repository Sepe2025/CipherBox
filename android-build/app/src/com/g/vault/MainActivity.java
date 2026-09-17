package com.g.vault;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private WebView web;
    private boolean closeAttempt = false;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_REQ = 1;
    private static final int CREATE_DOC_REQ = 2;
    private byte[] pendingData = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // FLAG_SECURE：禁止截屏/录屏，且不出现在最近任务缩略图里 ——
        // 密码列表页留在任务切换器的预览图上，等于把密码展示给旁边的人
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);

        web = new WebView(this);
        setContentView(web);

        WebSettings st = web.getSettings();
        st.setJavaScriptEnabled(true);
        st.setDomStorageEnabled(true);   // localStorage —— 数据就存在 App 私有目录
        st.setDatabaseEnabled(true);
        st.setAllowFileAccess(false);
        st.setAllowContentAccess(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // 卡片上的「打开网站」：外部 http(s) 链接交给系统浏览器，
                // 保险箱自己只加载打包在 assets 里的页面。
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                    } catch (Exception e) { /* 设备上没有浏览器时忽略 */ }
                    return true;
                }
                return false;
            }
        });

        // 「导入备份」：<input type=file> 在 WebView 里默认毫无反应，
        // 必须由原生把系统文件选择器接给它 —— 这是 1.0 版导入失灵的根因
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                try {
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");   // 不限定 application/json：部分文件提供器对 json 类型不可靠
                    startActivityForResult(Intent.createChooser(i, "选择备份文件"), FILE_REQ);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        // 导出桥：网页在壳环境里把备份（base64）交给原生写文件 / 分享
        web.addJavascriptInterface(new Bridge(), "AppBridge");

        web.loadUrl("file:///android_asset/vault.html");
    }

    private class Bridge {
        /* 去向 1：写入系统的「下载」文件夹（Android 10+ 走 MediaStore，
           免存储权限；老系统写 App 专属目录）。成功返回 true，网页才标记已备份 */
        @JavascriptInterface
        public boolean saveToDownloads(String name, String base64) {
            try {
                final byte[] data = Base64.decode(base64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= 29) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(data); os.close();
                } else {
                    File dir = new File(getExternalFilesDir(null), "Download");
                    dir.mkdirs();
                    OutputStream os = new FileOutputStream(new File(dir, name));
                    os.write(data); os.close();
                }
                runOnUiThread(new Runnable(){ public void run(){
                    Toast.makeText(MainActivity.this, "已保存到手机的「下载」文件夹", Toast.LENGTH_LONG).show();
                }});
                return true;
            } catch (Exception e) {
                runOnUiThread(new Runnable(){ public void run(){
                    Toast.makeText(MainActivity.this, "保存失败", Toast.LENGTH_LONG).show();
                }});
                return false;
            }
        }

        /* 去向 3：写临时文件 → content:// → 系统分享面板（微信/QQ/网盘/邮件…） */
        @JavascriptInterface
        public boolean shareFile(final String name, String base64) {
            try {
                final byte[] data = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getExternalFilesDir(null), "share");
                dir.mkdirs();
                final File f = new File(dir, name);
                OutputStream os = new FileOutputStream(f);
                os.write(data); os.close();
                runOnUiThread(new Runnable(){ public void run(){
                    Uri uri = Uri.parse("content://com.g.vault.files/" + name);
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("application/json");
                    i.putExtra(Intent.EXTRA_STREAM, uri);
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivity(Intent.createChooser(i, "分享备份"));
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "没有可分享的应用", Toast.LENGTH_LONG).show();
                    }
                }});
                return true;
            } catch (Exception e) { return false; }
        }

        /* 自动备份：写入 App 专属 auto/ 目录，保留最近 5 份（旧的自动删）。
           由网页在数据修改后节流调用 —— 静默执行，不打扰用户。 */
        @JavascriptInterface
        public boolean autoBackup(String name, String base64) {
            try {
                byte[] data = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getExternalFilesDir(null), "auto");
                dir.mkdirs();
                OutputStream os = new FileOutputStream(new File(dir, name));
                os.write(data); os.close();
                File[] files = dir.listFiles((d, n) -> n.endsWith(".json"));
                if (files != null && files.length > 5) {
                    java.util.Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
                    for (int i = 5; i < files.length; i++) files[i].delete();
                }
                return true;
            } catch (Exception e) { return false; }
        }

        /* 去向 2：SAF 保存对话框（ACTION_CREATE_DOCUMENT），用户自选文件夹和文件名。
           写入发生在 onActivityResult（异步），成功后回调页面的 afterExport */
        @JavascriptInterface
        public boolean createDocument(final String name, String base64) {
            try {
                pendingData = Base64.decode(base64, Base64.DEFAULT);
                runOnUiThread(new Runnable(){ public void run(){
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("application/json");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, CREATE_DOC_REQ);
                    } catch (Exception e) {
                        Toast.makeText(MainActivity.this, "无法打开保存对话框", Toast.LENGTH_LONG).show();
                        pendingData = null;
                    }
                }});
                return true;
            } catch (Exception e) { return false; }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_REQ && fileCallback != null) {
            Uri[] out = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                out = new Uri[]{ data.getData() };
            }
            fileCallback.onReceiveValue(out);
            fileCallback = null;
            return;
        }
        if (requestCode == CREATE_DOC_REQ) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingData != null) {
                try {
                    OutputStream os = getContentResolver().openOutputStream(data.getData());
                    os.write(pendingData); os.close();
                    Toast.makeText(this, "备份已保存到所选位置", Toast.LENGTH_LONG).show();
                    web.evaluateJavascript(
                        "if(typeof window.__vaultAfterExport==='function')window.__vaultAfterExport();", null);
                } catch (Exception e) {
                    Toast.makeText(this, "保存失败", Toast.LENGTH_LONG).show();
                }
            } else {
                Toast.makeText(this, "已取消", Toast.LENGTH_SHORT).show();
            }
            pendingData = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        // 第一次按：让页面先关掉最上层的弹层（编辑表单/设置/回收站…）；
        // 页面报告没有弹层可关时，第二次按才真正退出。
        if (closeAttempt) { super.onBackPressed(); return; }
        closeAttempt = true;
        web.evaluateJavascript(
            "try{ (window.__vaultCloseTop && window.__vaultCloseTop()) ? '1' : '0' }catch(e){ '0' }",
            new ValueCallback<String>() {
                @Override public void onReceiveValue(String v) {
                    if (v != null && v.indexOf('1') >= 0) {
                        closeAttempt = false;
                    } else {
                        Toast.makeText(MainActivity.this, "再按一次退出", Toast.LENGTH_SHORT).show();
                    }
                }
            });
    }
}
