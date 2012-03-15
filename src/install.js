/* install.js, for Cute Menus 
 * borrowed from the Tabbrowser Preferences extension
 */

var author      = "Wind Li"
var displayname = "Mozilla Message Filter Import/Export";
var version     = "1.3.0";
var packagename = "filtersimportexport";
var packagefile = packagename + ".jar";

var destDir     = getFolder( "Profile" );

var cflag       = CONTENT | PROFILE_CHROME;
var lflag	= LOCALE | PROFILE_CHROME;
var error       = null;
var installdir  = getFolder("Profile", "chrome");
var location    = getFolder(installdir, packagefile);
var folder      = null;

var msg = displayname + " " + version + " only installs into the profile directory. (OK) to continue or (Cancel) to abort the installation?";
if(!confirm(msg))
	{
	cancelInstall();
	}
else
{

// Begin the installation
initInstall(displayname + " " + version, "/" + author + "/" + displayname, version);

//if (File.exists(location)) {
//   alert("Sorry, " + displayname + " is already installed in the location you have chosen.");
//   cancelInstall();
//}

// Configure the JAR file
setPackageFolder(installdir);
error = addFile(packagename, version, "chrome/" + packagefile, installdir, null);


if (error == SUCCESS) 
	{
  	folder = getFolder(installdir, packagefile);
  	// Register the chrome content and locale data
	error = registerChrome(cflag, folder, "content/");
	registerChrome(lflag, folder, 'locale/en-US/');
 	registerChrome(lflag, folder, 'locale/zh-CN/');
	registerChrome(lflag, folder, 'locale/it-IT/');
	registerChrome(lflag, folder, 'locale/de-DE/');
	registerChrome(lflag, folder, 'locale/fr-FR/');
	registerChrome(lflag, folder, 'locale/hu-HU/');
	registerChrome(lflag, folder, 'locale/sk-SK/');
	registerChrome(lflag, folder, 'locale/ja-JP/');
	registerChrome(lflag, folder, 'locale/es-ES/');
	registerChrome(lflag, folder, 'locale/pt-PT/');
	registerChrome(lflag, folder, 'locale/pt-BR/');
	registerChrome(lflag, folder, 'locale/zh-TW/');
	registerChrome(lflag, folder, 'locale/pl-PL/');
	registerChrome(lflag, folder, 'locale/sv-SE/');
	registerChrome(lflag, folder, 'locale/nl-NL/');
	registerChrome(lflag, folder, 'locale/ru-RU/');
	registerChrome(lflag, folder, 'locale/uk-UA/');
	registerChrome(lflag, folder, 'locale/cs-CZ/');
	registerChrome(lflag, folder, 'locale/tr-TR/');
	registerChrome(lflag, folder, 'locale/mk-MK/');
	registerChrome(lflag, folder, 'locale/da-DK/');
	registerChrome(lflag, folder, 'locale/sr-RS/');

  	// Install the extension
	if (error == SUCCESS)
		{
		error = performInstall();
		if (error==999) 
			{
			//alert("An error occured during installation !\nErrorcode: " + error);
			//alert("Please restart Mozilla to update the changes.");
			}
  		}
  	else
  		{
    		alert("An error occurred, installation will be cancelled.\nErrorcode: " + error);
    		cancelInstall(error);
  		}
	}
}
