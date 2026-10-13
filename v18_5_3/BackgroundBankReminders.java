package com.alina.budget;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Minimal per-cycle settings mirror used while the UI is not running.
 * It never changes financial balances, records or imported transactions. */
public final class BackgroundBankReminders {
    private static final String PREFS = "background_bank_reminders_1853";
    private static final Pattern CARD = Pattern.compile("(?iu)(?:карта|карте|card|visa|mastercard)[^\\d]{0,35}(?:[•*xхXХ#-]+\\s*)?(\\d{4})\\b");
    private static final Pattern MCC = Pattern.compile("(?iu)(?:mcc|мсс)\\s*[:#№-]?\\s*(\\d{4})\\b");
    private static final String[] KNOWN = {
        "евроопт","evroopt","соседи","green","грин","spar","спар","корона","копеечка",
        "санта","santa","гиппо","gippo","виталюр","алми","простор","доброном",
        "кафе","coffee","кофе","burger king","kfc","макбай","пицца","pizza","dominos",
        "додо","ресторан","суши","sushi","такси","taxi","uber","bolt","yandex go",
        "яндекс go","белоруснефть","азс","заправка","парковка","аптека","apteka",
        "pharmacy","стоматология","маникюр","5 элемент","21vek","21век","электросила",
        "spotify","netflix","кинопоиск","youtube premium","кинотеатр","cinema","цветы"
    };
    private BackgroundBankReminders() {}
    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS,Context.MODE_PRIVATE); }

    public static synchronized boolean updateActiveConfig(Context context, String json) {
        try {
            JSONObject obj = new JSONObject(json);
            String cycleId = obj.optString("cycleId","");
            JSONArray accounts = obj.optJSONArray("accounts");
            if(cycleId.isEmpty() || accounts==null || accounts.length()>100) return false;
            JSONArray safe = new JSONArray();
            for(int i=0;i<accounts.length();i++) {
                JSONObject a=accounts.optJSONObject(i);
                if(a==null || !a.optBoolean("notificationLinkEnabled")) continue;
                String bank=a.optString("bankBrand","");
                if(!"alpha".equals(bank)&&!"belarusbank".equals(bank))continue;
                JSONObject x=new JSONObject();
                x.put("bankBrand",bank);
                x.put("last4",a.optString("last4",""));
                safe.put(x);
            }
            JSONObject config=new JSONObject();
            config.put("cycleId",cycleId);
            config.put("accounts",safe);
            return prefs(context).edit().putString("config",config.toString()).commit();
        } catch(Exception ignored) {return false;}
    }

    public static synchronized String routeCycle(Context context,String bank,String message){
        JSONObject cfg;
        try{cfg=new JSONObject(prefs(context).getString("config","{}"));}
        catch(Exception ignored){return "";}
        JSONArray accounts=cfg.optJSONArray("accounts");
        String cycle=cfg.optString("cycleId","");
        if(cycle.isEmpty()||accounts==null)return "";
        Matcher match=CARD.matcher(message==null?"":message);
        String last4=match.find()?match.group(1):"";
        int candidates=0,matching=0;boolean unbound=false;
        for(int i=0;i<accounts.length();i++){
            JSONObject a=accounts.optJSONObject(i);
            if(a==null || !bank.equals(a.optString("bankBrand")))continue;
            candidates++;
            String bound=a.optString("last4","");
            if(bound.isEmpty())unbound=true;
            if(!last4.isEmpty()&&last4.equals(bound))matching++;
        }
        if(candidates==0 || (last4.isEmpty()&&candidates>1))return "";
        if(!last4.isEmpty()&&candidates>1&&matching==0&&!unbound)return "";
        return cycle;
    }

    private static boolean likelyUnknown(String text){
        if(text==null||text.isEmpty())return false;
        String t=text.toLowerCase(Locale.ROOT).replace('ё','е');
        if(t.contains("код подтверждения")||t.contains("одноразовый пароль"))return false;
        Matcher m=MCC.matcher(t);
        if(m.find()&&m.group(1).matches("5411|5422|5441|5451|5462|5499|5812|5813|5814|4121|4111|4112|4131|4784|5541|5542|7523|5912|8011|8021|8099|7230|7298|5977|5200|5211|5712|5722|5732|7832|7922|7996|5947|5992"))return false;
        for(String word:KNOWN)if(t.contains(word))return false;
        return true;
    }
    private static synchronized boolean markOnce(Context context,String fp){
        if(fp==null||fp.isEmpty())return false;
        SharedPreferences p=prefs(context);
        JSONArray old;
        try{old=new JSONArray(p.getString("seen","[]"));}
        catch(Exception ignored){old=new JSONArray();}
        for(int i=0;i<old.length();i++)if(fp.equals(old.optString(i)))return false;
        JSONArray next=new JSONArray();
        for(int i=Math.max(0,old.length()-349);i<old.length();i++)next.put(old.optString(i));
        next.put(fp);
        return p.edit().putString("seen",next.toString()).commit();
    }
    public static void notifyNewBankMessage(Context context,JSONObject item){
        String cycle=item.optString("targetCycleId","");
        String fp=item.optString("fingerprint","");
        if(cycle.isEmpty() || !likelyUnknown(item.optString("text","")) || !markOnce(context,fp))return;
        CategoryReminderNotifications.showBackgroundCandidate(context,cycle,fp);
    }
}
