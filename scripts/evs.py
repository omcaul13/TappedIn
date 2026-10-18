# castLabs EVS command line, with Windows' certificate store. Run it isolated, from the installer's venv:
#   .venv-evs\Scripts\python.exe -I scripts\evs.py account signup|refresh|...
#   .venv-evs\Scripts\python.exe -I scripts\evs.py vmp sign-pkg node_modules\electron\dist
# The rest of the arguments go to castLabs' own CLI unchanged (the same as `evs-account` / `evs-vmp`).
#
# Why: antivirus "web shields" (Norton on the owner's laptop) re-sign HTTPS with their own root, which
# Windows trusts but Python's certifi bundle doesn't, so EVS fails with CERTIFICATE_VERIFY_FAILED.
# truststore makes Python verify with the OS store. It has to be injected before castlabs_evs imports
# boto3/requests, which is why this wrapper exists instead of `python -m castlabs_evs.vmp`.
import sys

TOOLS = ('account', 'vmp')


def main():
    try:
        import truststore
    except ImportError:
        pass
    else:
        truststore.inject_into_ssl()

    if len(sys.argv) < 2 or sys.argv[1] not in TOOLS:
        print('usage: python -I scripts/evs.py account|vmp <castLabs EVS arguments>', file=sys.stderr)
        return 2

    tool = sys.argv[1]
    # castLabs' CLIs read sys.argv themselves; make it look like their own console script.
    sys.argv[:] = ['evs-' + tool] + sys.argv[2:]
    if tool == 'account':
        from castlabs_evs.cli.account import main as run
    else:
        from castlabs_evs.cli.vmp import main as run
    run()
    return 0


if __name__ == '__main__':
    sys.exit(main())
