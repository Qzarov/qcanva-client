package pro.qzarov.qcanva;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import pro.qzarov.qcanva.qspace.QSpaceAgentPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered before the bridge is created.
        registerPlugin(QSpaceAgentPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
