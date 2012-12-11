var filtersimportexport = {
    gfilterImportExportRDF : Components.classes["@mozilla.org/rdf/rdf-service;1"].getService(Components.interfaces.nsIRDFService),
    RootFolderUriMark : "RootFolderUri",
    MailnewsTagsMark : "MailnewsTagsUri",
    filterMailnewsHeaders : "mailnews.customHeaders",
    TagSep : ":==:", // Cannot simply use "=" because a tag's name could have an equals which would then cause problems.
    CurrentVersion : "1.4.0",

    strbundle: null,
    gFilterListMsgWindow : null,
    /** if the selected server cannot have filters, get the default server
 * if the default server cannot have filters, check all accounts
 * and get a server that can have filters.
 */
    getServerThatCanHaveFilters : function () {
        var firstItem = null;

        var accountManager
        = Components.classes["@mozilla.org/messenger/account-manager;1"].
        getService(Components.interfaces.nsIMsgAccountManager);

        var defaultAccount = accountManager.defaultAccount;
        var defaultIncomingServer = defaultAccount.incomingServer;

        // check to see if default server can have filters
        if (defaultIncomingServer.canHaveFilters) {
            firstItem = defaultIncomingServer.serverURI;
        }
        // if it cannot, check all accounts to find a server
        // that can have filters
        else {
            var allServers = accountManager.allServers;
            var numServers = allServers.Count();
            var index = 0;
            for (index = 0; index < numServers; index++) {
                var currentServer
                = allServers.GetElementAt(index).QueryInterface(Components.interfaces.nsIMsgIncomingServer);

                if (currentServer.canHaveFilters) {
                    firstItem = currentServer.serverURI;
                    break;
                }
            }
        }

        return firstItem;
    },
    TrimImpl : function(s)
    {
        return s.replace(/(^\s*)|(\s*$)/g, "");
    },
    onLoad: function() {
        // initialization code
        this.initialized = true;
        
    },
    getString:function (name)
    {
        try{
        
            if (this.strbundle == null)
                this.strbundle = document.getElementById("filtersimportexportStrings");
            return this.strbundle.getString(name);
        }catch(e)
        {
            alert(name + " " + e);
            return "";
        }
    },
    onAccountLoad: function() {
        // initialization code
        var firstItem = filtersimportexport.getServerThatCanHaveFilters();

        
        if (firstItem) {
            var serverMenu = document.getElementById("serverMenu");
            //alert(firstItem);
            serverMenu.setAttribute("uri",firstItem);
            
        }
        filtersimportexport.gFilterListMsgWindow = Components.classes["@mozilla.org/messenger/msgwindow;1"].createInstance(Components.interfaces.nsIMsgWindow);
        filtersimportexport.gFilterListMsgWindow.domWindow = window;
        filtersimportexport.gFilterListMsgWindow.rootDocShell.appType = Components.interfaces.nsIDocShell.APP_TYPE_MAIL;
        
    },
    
    onFilterServerClick: function(selection) {
        //alert(selection.tagName);
        var itemURI = selection.getAttribute('id');
        var serverMenu = document.getElementById("serverMenu");
        //alert(itemURI);
        serverMenu.setAttribute("uri",itemURI);
        //alert(itemURI)
    },
    onMenuItemCommand: function() {
        window.open("chrome://filtersimportexport/content/FilterImEx.xul", "", "chrome,centerscreen");
    },
    getCurrentFolder : function() {
        var msgFolder = null;
        if (typeof gCurrentFolder != "undefined" &&  gCurrentFolder)
            msgFolder = gCurrentFolder;
        else
        {
            var serverMenu = document.getElementById("serverMenu");
            var msgFilterURL=serverMenu.getAttribute("uri");
            if (!msgFilterURL)
                msgFilterURL=document.getElementById("serverMenuPopup").getAttribute("id");
            //alert(msgFilterURL);
            var resource = filtersimportexport.gfilterImportExportRDF.GetResource(msgFilterURL);
            msgFolder = resource.QueryInterface(Components.interfaces.nsIMsgFolder);

            //Calling getFilterList will detect any errors in rules.dat, backup the file, and alert the user
            //we need to do this because gFilterTree.setAttribute will cause rdf to call getFilterList and there is
            //no way to pass msgWindow in that case.

            if (msgFolder && typeof gFilterListMsgWindow !=  "undefined" && gFilterListMsgWindow)
                msgFolder.getFilterList(gFilterListMsgWindow);
            
        }
        // this will get the deferred to account root folder, if server is deferred
        //msgFolder = msgFolder.server.rootMsgFolder;
        return msgFolder;
    },
    onImportFilter: function() {
        
        var msgFolder = filtersimportexport.getCurrentFolder();
        var msgFilterURL = msgFolder.URI;
        
		var filterList = this.currentFilterList(msgFolder,msgFilterURL);
        filterList.saveToDefaultFile();
        
        var tagsAndFilterStr = this.readTagsAndFiltersFile();
        
        // read all tags line-by-line and save them.
        var filterStr = this.tryImportTags(tagsAndFilterStr);
        if (filterStr == null)
        {
            alert(this.getString("importfailed"));
            return;
        }
        
        // read filters.
        if (filterStr.substr(0,filtersimportexport.RootFolderUriMark.length) != filtersimportexport.RootFolderUriMark)
        {
            alert(this.getString("importfailed"));
            return;
        }
        var oldFolderRoot = filterStr.substr(filtersimportexport.RootFolderUriMark.length + 1,filterStr.indexOf("\n") - filterStr.indexOf("=") -1);
        
        // skip the RootFolderUri=xxxx line and move to the filters.
        filterStr = this.consumeLine(filterStr);

        //deal with mailnews.customHeaders
        if (filterStr.substr(0,filtersimportexport.filterMailnewsHeaders.length) == filtersimportexport.filterMailnewsHeaders)
        {
            var mailheaders = filterStr.substr(filtersimportexport.filterMailnewsHeaders.length + 1,filterStr.indexOf("\n") - filterStr.indexOf("=") -1);
            filterStr = this.consumeLine(filterStr);
            this.mergeHeaders(mailheaders);
        }
        var reg = new RegExp(filtersimportexport.RootFolderUriMark,"g");
        s = filterStr.replace(reg,msgFilterURL);
        filterList.saveToDefaultFile();
        if (filterList.defaultFile.nativePath)
            var stream = this.createFile(filterList.defaultFile.nativePath);
        else
            var stream = this.createFile(filterList.defaultFile.path);
                  
        var filterService = Components.classes["@mozilla.org/messenger/services/filters;1"].getService(Components.interfaces.nsIMsgFilterService);                  
        
        //close the filter list
        if (filterService && filterService.CloseFilterList)
            filterService.CloseFilterList(filterList);
        
        stream.write(s, s.length);
        stream.close();
        
        //reopen filter list
        filterList = this.currentFilterList(msgFolder,msgFilterURL);
        
        var confirmStr = "";
        if (oldFolderRoot != msgFilterURL)
            confirmStr = this.getString("finishwithwarning");
        else
            confirmStr = this.getString("importfinish");
    
        if (confirm(confirmStr + this.getString("restartconfrim")))
        {
            var nsIAppStartup = Components.interfaces.nsIAppStartup;
            Components.classes["@mozilla.org/toolkit/app-startup;1"].getService(nsIAppStartup).quit(nsIAppStartup.eForceQuit | nsIAppStartup.eRestart);
        }
        else
            alert(this.getString("restartreminder"));
    },
    readTagsAndFiltersFile: function() {
        var filepath = this.selectFile(Components.interfaces.nsIFilePicker.modeOpen);
        var inputStream = this.openFile(filepath.path);

        var sstream = Components.classes["@mozilla.org/scriptableinputstream;1"]
        .createInstance(Components.interfaces.nsIScriptableInputStream);
        sstream.init(inputStream);

        var str = sstream.read(4096);
        var tagsAndFilterStr = "";
        while (str.length > 0) {
            tagsAndFilterStr += str;
            str = sstream.read(4096);
        }
        sstream.close();
        inputStream.close();
        return tagsAndFilterStr;
    },
    tryImportTags: function(str) {
        var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                    .getService(Components.interfaces.nsIPrefService);
        var root = Components.classes["@mozilla.org/preferences-service;1"]
                    .getService(Components.interfaces.nsIPrefBranch);
        
        var line = this.getLine(str);
        if (line.substr(0,filtersimportexport.MailnewsTagsMark.length) == filtersimportexport.MailnewsTagsMark)
        {
        	str = this.consumeLine(str);
			line = this.getLine(str);
			while (line.substr(0,filtersimportexport.RootFolderUriMark.length) != filtersimportexport.RootFolderUriMark)
			{
				//using indexes instead of split because of the possibility 
				//that a tag name has an equals character
                //ignore lines not start with mailnews.tags
                if (line.indexOf("mailnews.tags")==0)
                {
                    var key = line.substr(0, line.indexOf(filtersimportexport.TagSep));
                    var tagvalue = line.substr(key.length + filtersimportexport.TagSep.length, line.length);

                    try { root.setCharPref(key, tagvalue); } // set the pref
                    catch (e) { return null; }
                }
				str = this.consumeLine(str);
				line = this.getLine(str);
			}
			// save changes to preference file
			prefs.savePrefFile(null);
        }
        return str;
    },
    getLine: function(str) {
        return str.substr(0, str.indexOf("\n"));
    },
    consumeLine: function(str) {
        return str.substr(str.indexOf("\n")+1);
    },
    onExportFilter: function() {

        var    msgFolder = filtersimportexport.getCurrentFolder();
        var    msgFilterURL = msgFolder.URI;
		var	   filterList = this.currentFilterList(msgFolder,msgFilterURL);
        filterList.saveToDefaultFile();
        //   for (var i = 0; i < filterList.filterCount; i++)
        //      alert (filterList.getFilterAt(i).filterName);
        var data = "";
        data = this.tryExportTags(data);
        
        data += "RootFolderUri=" + msgFilterURL + "\n";
        data += filtersimportexport.filterMailnewsHeaders + "=" + this.getHeaders() + "\n";
        
        var filepath = this.selectFile(Components.interfaces.nsIFilePicker.modeSave);
        var stream = this.createFile(filepath.path);
        if (filterList.defaultFile.nativePath)
            var inputStream = this.openFile(filterList.defaultFile.nativePath);
        else
            var inputStream = this.openFile(filterList.defaultFile.path);
        
        var sstream = Components.classes["@mozilla.org/scriptableinputstream;1"]
        .createInstance(Components.interfaces.nsIScriptableInputStream);
        sstream.init(inputStream);
        
        var str = sstream.read(4096);
        while (str.length > 0) {
            data += str;
            str = sstream.read(4096);
        }
        
        sstream.close();
        inputStream.close();
        
        //alert(data);
        stream.write(data,data.length);
        stream.close();
        
    },
    tryExportTags:function (filtersStr) {
        filtersStr += filtersimportexport.MailnewsTagsMark + "=\n";

		var prefs = Components.classes["@mozilla.org/preferences-service;1"]
					  .getService(Components.interfaces.nsIPrefService);
		var branch = prefs.getBranch("mailnews.tags.");
		var children = branch.getChildList("", {});
        var hasCustomizedTag = false;
		for (index in children) {
			try {
				var tag = children[index];
                if (tag.indexOf("$")==0) //skip the default tags
                    continue;
				var value = branch.getCharPref(tag);
				filtersStr += "mailnews.tags." + tag + filtersimportexport.TagSep + value + "\n";
                hasCustomizedTag = true;
			}
			catch (e) {
				if (e.name != "NS_ERROR_UNEXPECTED" || tag != "version")
					alert("Uh oh, not able to save a tag.");
			}
		}
        if (hasCustomizedTag)
            return filtersStr;
        else
            return "";
    },
    selectFile: function (mode) {
        var fp = Components.classes["@mozilla.org/filepicker;1"]
        .createInstance(Components.interfaces.nsIFilePicker);
        
        
        var title = this.getString("exporttitle");
        if (mode == Components.interfaces.nsIFilePicker.modeOpen)
            title = this.getString("importtitle");
        fp.init(window, title, mode);
        fp.appendFilters(Components.interfaces.nsIFilePicker.filterAll);
        
        
        var ret = fp.show();
        if (ret == Components.interfaces.nsIFilePicker.returnOK ||
            ret == Components.interfaces.nsIFilePicker.returnReplace) {
            return  fp.file;
        }
    },
    createFile :function (aPath) {
        if (! netscape.security.PrivilegeManager) return null;
        netscape.security.PrivilegeManager
        .enablePrivilege("UniversalFileAccess UniversalXPConnect");
        
        var file=Components.classes["@mozilla.org/file/local;1"]
        .createInstance(Components.interfaces.nsILocalFile);
        file.initWithPath(aPath);
        
        var fileStream = Components.classes['@mozilla.org/network/file-output-stream;1']
        .createInstance(Components.interfaces.nsIFileOutputStream);
        fileStream.init(file, 0x02 | 0x08 | 0x20, 0664, 0);
        return fileStream;
    },
    openFile :function (aPath) {
        if (! netscape.security.PrivilegeManager) return null;
        netscape.security.PrivilegeManager
        .enablePrivilege("UniversalFileAccess UniversalXPConnect");
        
        var file=Components.classes["@mozilla.org/file/local;1"]
        .createInstance(Components.interfaces.nsILocalFile);
        file.initWithPath(aPath);
        
        var fileStream = Components.classes['@mozilla.org/network/file-input-stream;1']
        .createInstance(Components.interfaces.nsIFileInputStream);
        fileStream.init(file, 0x01, 0664, 0);
        return fileStream;
    },
    currentFilterList: function(msgFolder,serverUri) {
        if (typeof gCurrentFilterList != "undefined" && gCurrentFilterList)
            return gCurrentFilterList;
        // note, serverUri might be a newsgroup
        var filterList = null;
        if (filtersimportexport.gFilterListMsgWindow)
            filterList = msgFolder.getFilterList(filtersimportexport.gFilterListMsgWindow);
        if (!filterList)
            filterList = filtersimportexport.gfilterImportExportRDF.GetResource(serverUri).GetDelegate("filter", Components.interfaces.nsIMsgFilterList);
        return filterList;
    },
    overlayDialog:function() {
        window.removeEventListener("load", filtersimportexport.overlayDialog, false);
        
        var exportButton = document.getElementById("exportBurron");
        var importButton = document.getElementById("importButton");
        var vboxElement = document.getElementById("newButton").parentNode;

        // Append them to the end of the button box
        vboxElement.appendChild(exportButton);
    //    vboxElement.appendChild(importButton);
    },
    getPref: function()
    {
        var mailPrefs = Components.classes["@mozilla.org/preferences-service;1"].
        getService(Components.interfaces.nsIPrefService).getBranch("mailnews");
        try{
            mailPrefs=mailPrefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
        }catch(e){}

        return mailPrefs;

    },
    getHeaders: function()
    {
        return this.getPref().getCharPref(".customHeaders");
    },
    setHeader: function(header)
    {
        this.getPref().setCharPref(".customHeaders",header);
    },
    mergeHeaders : function (headers)
    {
        var currHeaders = this.getHeaders().split(":");
        var addHeaders = headers.split(":");
        var newHeaders = currHeaders;
        for(var i=0;i<addHeaders.length;++i)
        {
            var found = false;
            for(var j=0;j<newHeaders.length;j++)
            {
                if (filtersimportexport.TrimImpl(addHeaders[i]) == filtersimportexport.TrimImpl(newHeaders[j]))
                {
                    found = true;
                    break;
                }
            }
            if (!found)
                newHeaders.push(addHeaders[i])
        }
        var newStr = "";
        for (var i=0;i<newHeaders.length;++i)
        {
            if (newStr != "")
                newStr = newStr + ": " + newHeaders[i];
            else
                newStr = newHeaders[i];
        }
        this.setHeader(newStr);
    },
    checkUpdate:function () {
        //var filterHome = "http://www.teesoft.info/content/view/27/1/";
        var filterHome = "http://www.teesoft.info/content/view/58/56/";
        //    var filterHome = "http://www.teesoft.info";

        var prefService = Components.classes["@mozilla.org/preferences;1"].getService(Components.interfaces.nsIPrefService);
        var prefBranch = prefService.getBranch("filterimportexport.");
        if (!prefBranch.prefHasUserValue("last_version")) {  // new user
            prefBranch.setCharPref("last_version", filtersimportexport.CurrentVersion);
            this.openURL(filterHome,null);
        } else { // check for upgrade
            var lastVersion = prefBranch.getCharPref("last_version");
            if (lastVersion != filtersimportexport.CurrentVersion)
            {
                prefBranch.setCharPref("last_version", filtersimportexport.CurrentVersion);
                this.openURL(filterHome,null);
            //addfilterButton();
            }
        }
    }
    ,
    openURL: function(url, param)
    {

        try{
            //window.open(url,param);
            var protocolSvc = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
            .getService(Components.interfaces.nsIExternalProtocolService);

            var uri = Components.classes["@mozilla.org/network/io-service;1"]
            .getService(Components.interfaces.nsIIOService)
            .newURI(url, null, null);
            protocolSvc.loadUrl(uri);
        } catch (ex) {
            alert(ex);
        }
    }


};
filtersimportexport.checkUpdate();
//window.addEventListener("load", function(e) { filtersimportexport.onLoad(e); }, false); 
