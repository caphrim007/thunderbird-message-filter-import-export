filtersimportexport = {
    gfilterImportExportRDF: Components.classes["@mozilla.org/rdf/rdf-service;1"].getService(Components.interfaces.nsIRDFService),
    RootFolderUriMark: "RootFolderUri",
    MailnewsTagsMark: "MailnewsTagsUri",
    filterMailnewsHeaders: "mailnews.customHeaders",

    # Cannot simply use "=" because a tag's name could have an equals which would then cause problems.
    TagSep: ":==:",

    CurrentVersion: "1.4.0",

    strbundle: null,
    gFilterListMsgWindow: null,

    ###
    if the selected server cannot have filters, get the default server
    if the default server cannot have filters, check all accounts
    and get a server that can have filters.
    ###
    getServerThatCanHaveFilters: () ->
        accountManager = Components.classes["@mozilla.org/messenger/account-manager;1"].getService(Components.interfaces.nsIMsgAccountManager)

        defaultAccount = accountManager.defaultAccount
        defaultIncomingServer = defaultAccount.incomingServer

        # check to see if default server can have filters
        if defaultIncomingServer.canHaveFilters
            firstItem = defaultIncomingServer.serverURI
        else
            # If it cannot, check all accounts to find a server
            # that can have filters
            allServers = accountManager.allServers
            numServers = allServers.Count()
            index = 0
            for index in [0...numServers]
                currentServer = allServers.GetElementAt(index).QueryInterface(Components.interfaces.nsIMsgIncomingServer)
                if currentServer.canHaveFilters
                    firstItem = currentServer.serverURI
                    break

        return firstItem
    ,

    TrimImpl: (s) ->
        return s.replace /(^\s*)|(\s*$)/g, ""
    ,

    onLoad: () ->
        this.initialized = true
    ,

    getString: (name) ->
        try
            unless this.strbundle
                this.strbundle = document.getElementById("filtersimportexportStrings")

            return this.strbundle.getString(name)
        catch e
            alert "#{name} #{e}"
            return ""
    ,

    onAccountLoad: () ->
        # initialization code
        firstItem = filtersimportexport.getServerThatCanHaveFilters()

        if firstItem
            serverMenu = document.getElementById("serverMenu")
            serverMenu.setAttribute "uri", firstItem
            
        filtersimportexport.gFilterListMsgWindow = Components.classes["@mozilla.org/messenger/msgwindow;1"].createInstance(Components.interfaces.nsIMsgWindow)
        filtersimportexport.gFilterListMsgWindow.domWindow = window
        filtersimportexport.gFilterListMsgWindow.rootDocShell.appType = Components.interfaces.nsIDocShell.APP_TYPE_MAIL

        return
    ,
    
    onFilterServerClick: (select) ->
        itemURI = selection.getAttribute('id')
        serverMenu = document.getElementById("serverMenu")
        serverMenu.setAttribute "uri", itemURI

        return
    ,

    onMenuItemCommand: () ->
        window.open "chrome://filtersimportexport/content/FilterImEx.xul", "", "chrome,centerscreen"
    ,

    getCurrentFolder: () ->
        if gCurrentFolder
            msgFolder = gCurrentFolder
        else
            serverMenu = document.getElementById("serverMenu")
            msgFilterURL=serverMenu.getAttribute("uri")
            if not msgFilterURL
                msgFilterURL = document.getElementById("serverMenuPopup").getAttribute("id")

            resource = filtersimportexport.gfilterImportExportRDF.GetResource(msgFilterURL)
            msgFolder = resource.QueryInterface(Components.interfaces.nsIMsgFolder)

            # Calling getFilterList will detect any errors in rules.dat, backup the file, and alert the user
            # we need to do this because gFilterTree.setAttribute will cause rdf to call getFilterList and there is
            # no way to pass msgWindow in that case.

            if msgFolder and gFilterListMsgWindow
                msgFolder.getFilterList(gFilterListMsgWindow)

        # This will get the deferred to account root folder, if server is deferred
        return msgFolder
    ,

    onImportFilter: () ->
        msgFolder = filtersimportexport.getCurrentFolder()
        msgFilterURL = msgFolder.URI

        filterList = this.currentFilterList(msgFolder,msgFilterURL)
        filterList.saveToDefaultFile()

        tagsAndFilterStr = this.readTagsAndFiltersFile()

        # read all tags line-by-line and save them.
        filterStr = this.tryImportTags(tagsAndFilterStr)
        if not filterStr
            alert(this.getString("importfailed"))
            return

        # Read filters
        if filterStr.substr(0,filtersimportexport.RootFolderUriMark.length) != filtersimportexport.RootFolderUriMark
            alert(this.getString("importfailed"))
            return

        oldFolderRoot = filterStr.substr(filtersimportexport.RootFolderUriMark.length + 1,filterStr.indexOf("\n") - filterStr.indexOf("=") -1)

        # Skip the RootFolderUri=xxxx line and move to the filters
        filterStr = this.consumeLine(filterStr)

        # deal with mailnews.customHeaders
        if filterStr.substr(0,filtersimportexport.filterMailnewsHeaders.length) == filtersimportexport.filterMailnewsHeaders
            mailheaders = filterStr.substr(filtersimportexport.filterMailnewsHeaders.length + 1,filterStr.indexOf("\n") - filterStr.indexOf("=") -1)
            filterStr = this.consumeLine(filterStr)
            this.mergeHeaders(mailheaders)

        reg = new RegExp(filtersimportexport.RootFolderUriMark,"g")
        s = filterStr.replace(reg,msgFilterURL)
        filterList.saveToDefaultFile()
        if filterList.defaultFile.nativePath
            stream = this.createFile(filterList.defaultFile.nativePath)
        else
            stream = this.createFile(filterList.defaultFile.path)

        filterService = Components.classes["@mozilla.org/messenger/services/filters;1"].getService(Components.interfaces.nsIMsgFilterService)

        # Close the filter list
        if filterService and filterService.CloseFilterList
            filterService.CloseFilterList(filterList)

        stream.write(s, s.length)
        stream.close()

        # Re-open filter list
        filterList = this.currentFilterList(msgFolder,msgFilterURL)

        if oldFolderRoot != msgFilterURL
            confirmStr = this.getString("finishwithwarning")
        else
            confirmStr = this.getString("importfinish")

        if confirm(confirmStr + this.getString("restartconfrim"))
            nsIAppStartup = Components.interfaces.nsIAppStartup
            Components.classes["@mozilla.org/toolkit/app-startup;1"].getService(nsIAppStartup).quit(nsIAppStartup.eForceQuit | nsIAppStartup.eRestart)
        else
            alert(this.getString("restartreminder"))
    ,

    readTagsAndFiltersFile: () ->
        filepath = this.selectFile(Components.interfaces.nsIFilePicker.modeOpen)
        inputStream = this.openFile(filepath.path)

        sstream = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance(Components.interfaces.nsIScriptableInputStream)
        sstream.init(inputStream)

        str = sstream.read(4096)
        while str.length > 0
            tagsAndFilterStr += str
            str = sstream.read(4096)

        sstream.close()
        inputStream.close()

        return tagsAndFilterStr
    ,

    tryImportTags: (str) ->
        prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService)
        root = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch)

        line = this.getLine(str)
        if line.substr(0,filtersimportexport.MailnewsTagsMark.length) == filtersimportexport.MailnewsTagsMark
            str = this.consumeLine(str)
            line = this.getLine(str)
            while line.substr(0,filtersimportexport.RootFolderUriMark.length) != filtersimportexport.RootFolderUriMark
                # using indexes instead of split because of the possibility 
                # that a tag name has an equals character
                # ignore lines not start with mailnews.tags
                if line.indexOf("mailnews.tags") == 0
                    key = line.substr(0, line.indexOf(filtersimportexport.TagSep))
                    tagvalue = line.substr(key.length + filtersimportexport.TagSep.length, line.length)

                    try
                        # set the pref
                        root.setCharPref(key, tagvalue)
                    catch e
                        return null

                str = this.consumeLine(str)
                line = this.getLine(str)

            # save changes to preference file
            prefs.savePrefFile(null)

        return str
    ,

    getLine: (str) ->
        return str.substr(0, str.indexOf("\n"))
    ,

    consumeLine: (str) ->
        return str.substr(str.indexOf("\n") + 1)
    ,

    onExportFilter: () ->
        msgFolder = filtersimportexport.getCurrentFolder()
        msgFilterURL = msgFolder.URI

        filterList = this.currentFilterList(msgFolder,msgFilterURL)
        filterList.saveToDefaultFile()

        data = this.tryExportTags(data)
        data += "RootFolderUri=" + msgFilterURL + "\n"
        data += filtersimportexport.filterMailnewsHeaders + "=" + this.getHeaders() + "\n"

        filepath = this.selectFile(Components.interfaces.nsIFilePicker.modeSave)
        stream = this.createFile(filepath.path)
        if filterList.defaultFile.nativePath
            inputStream = this.openFile(filterList.defaultFile.nativePath)
        else
            inputStream = this.openFile(filterList.defaultFile.path)

        sstream = Components.classes["@mozilla.org/scriptableinputstream;1"].createInstance(Components.interfaces.nsIScriptableInputStream)
        sstream.init(inputStream)
        
        str = sstream.read(4096)
        while str.length > 0
            data += str
            str = sstream.read(4096)

        sstream.close()
        inputStream.close()

        stream.write(data,data.length)
        stream.close()
    ,

    tryExportTags: (filtersStr) ->
        filtersStr += filtersimportexport.MailnewsTagsMark + "=\n"

        prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService)
        branch = prefs.getBranch("mailnews.tags.")
        children = branch.getChildList("", {})
        hasCustomizedTag = false
        for index in children
            try
                tag = children[index]
                if tag.indexOf("$") == 0
                    # skip the default tags
                    continue

                value = branch.getCharPref(tag)
                filtersStr += "mailnews.tags." + tag + filtersimportexport.TagSep + value + "\n"
                hasCustomizedTag = true
            catch e
                if e.name != "NS_ERROR_UNEXPECTED" or tag != "version"
                    alert("Uh oh, not able to save a tag.")

        if hasCustomizedTag
            return filtersStr
        else
            return ""
    ,

    selectFile: (mode) ->
        fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(Components.interfaces.nsIFilePicker)
        title = this.getString("exporttitle")

        if mode == Components.interfaces.nsIFilePicker.modeOpen
            title = this.getString("importtitle")

        fp.init(window, title, mode)
        fp.appendFilters(Components.interfaces.nsIFilePicker.filterAll)

        ret = fp.show()

        returnOK = Components.interfaces.nsIFilePicker.returnOK
        returnReplace = Components.interfaces.nsIFilePicker.returnReplace
        if ret == returnOK or ret == returnReplace
            return fp.file
    ,

    createFile: (apath) ->
        if not netscape.security.PrivilegeManager
            return null

        netscape.security.PrivilegeManager.enablePrivilege("UniversalFileAccess UniversalXPConnect")

        file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile)
        file.initWithPath(aPath)

        fileStream = Components.classes['@mozilla.org/network/file-output-stream;1'].createInstance(Components.interfaces.nsIFileOutputStream)
        fileStream.init(file, 0x02 | 0x08 | 0x20, 0o664, 0)
        return fileStream
    ,

    openFile: (aPath) ->
        if not netscape.security.PrivilegeManager
            return null

        netscape.security.PrivilegeManager.enablePrivilege("UniversalFileAccess UniversalXPConnect")

        file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile)
        file.initWithPath(aPath)

        fileStream = Components.classes['@mozilla.org/network/file-input-stream;1'].createInstance(Components.interfaces.nsIFileInputStream)
        fileStream.init(file, 0x01, 0o664, 0)
        return fileStream
    ,

    currentFilterList: (msgFolder,serverUri) ->
        if gCurrentFilterList
            return gCurrentFilterList

        # note, serverUri might be a newsgroup
        filterList = null

        if filtersimportexport.gFilterListMsgWindow
            filterList = msgFolder.getFilterList(filtersimportexport.gFilterListMsgWindow)

        if not filterList
            filterList = filtersimportexport.gfilterImportExportRDF.GetResource(serverUri).GetDelegate("filter", Components.interfaces.nsIMsgFilterList)

        return filterList
    ,

    overlayDialog: () ->
        window.removeEventListener("load", filtersimportexport.overlayDialog, false)

        exportButton = document.getElementById("exportBurron")
        importButton = document.getElementById("importButton")
        vboxElement = document.getElementById("newButton").parentNode

        # Append them to the end of the button box
        vboxElement.appendChild(exportButton)

        return
    ,

    getPref: () ->
        mailPrefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("mailnews")
        try
            mailPrefs = mailPrefs.QueryInterface(Components.interfaces.nsIPrefBranch2)

        return mailPrefs
    ,

    getHeaders: () ->
        return this.getPref().getCharPref(".customHeaders")
    ,

    setHeader: (header) ->
        this.getPref().setCharPref(".customHeaders",header)
        return
    ,

    mergeHeaders: (headers) ->
        currHeaders = this.getHeaders().split(":")
        addHeaders = headers.split(":")
        newHeaders = currHeaders

        for i in [0..addheaders.length]
            found = false

            for j in [0..newHeaders.length]
                if filtersimportexport.TrimImpl(addHeaders[i]) == filtersimportexport.TrimImpl(newHeaders[j])
                    found = true
                    break

            if not found
                newHeaders.push(addHeaders[i])

        newStr = ""
        for i in [0..newHeaders.length]
            if newStr != ""
                newStr = "#{newStr}: #{newHeaders[i]}"
            else
                newStr = newHeaders[i]

        this.setHeader(newStr)
        return
}
