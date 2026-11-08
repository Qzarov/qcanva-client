package pro.qzarov.qcanva;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import pro.qzarov.qcanva.qspace.QSpaceAgentPlugin;
import pro.qzarov.qcanva.upload.NativeUploadPlugin;
import pro.qzarov.qcanva.upload.RecordingChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge is created.
        registerPlugin(QSpaceAgentPlugin.class);
        registerPlugin(NativeUploadPlugin.class);
        super.onCreate(savedInstanceState);
        // Notes the files picked for the page, so they upload natively (in the
        // background, streamed from disk). Set before the activity starts: the
        // client registers its activity-result launchers in its constructor.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setWebChromeClient(new RecordingChromeClient(bridge));
        }
    }
}
