package com.g.vault;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileNotFoundException;

/* 分享用：把 App 私有目录里的备份文件以 content:// 暴露给系统分享面板。
   不用 androidx FileProvider（避免引入依赖），自实现 openFile；
   exported=false + grantUriPermissions=true，只对发起分享的目标临时授权。 */
public class BackupProvider extends ContentProvider {
    private File base;

    @Override public boolean onCreate() {
        /* provider 在 App 启动的最早期运行 —— 这里抛任何异常都会让
           App 打都打不开，所以全部兜住，存储异常时退到 cache 目录 */
        try {
            File ext = getContext().getExternalFilesDir(null);
            base = (ext != null) ? new File(ext, "share") : new File(getContext().getCacheDir(), "share");
            base.mkdirs();
        } catch (Throwable t) {
            try {
                base = new File(getContext().getCacheDir(), "share");
                base.mkdirs();
            } catch (Throwable ignore) {}
        }
        return true;
    }

    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        // 只允许单层文件名，防路径穿越
        if (name == null || name.length() == 0 || name.contains("..") || name.contains("/") || name.contains("\\")) {
            throw new FileNotFoundException();
        }
        return ParcelFileDescriptor.open(new File(base, name), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Cursor query(Uri uri, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri uri) { return "application/json"; }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
